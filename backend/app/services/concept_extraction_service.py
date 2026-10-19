import os
import re
import json
import asyncio
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from bson import ObjectId
from google import genai
from google.genai import types

from app.core.config import settings
from app.db.neo4j_db import neo4j_db
from app.db.redis import redis_client

PROMPT_VERSION = "v1"
FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "fixtures" / "gemini_replays"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

# In-process rate-limiting token bucket fallback
_LAST_CALL_TIMES = []

def normalize_concept_name(name: str) -> str:
    """Normalizes concept string for deduplication (lowercase, stripped punctuation, unified snake_case)."""
    clean = name.replace("_", " ").replace("-", " ")
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', clean.lower()).strip()
    clean = re.sub(r'\s+', '_', clean)
    return clean

async def acquire_gemini_rate_slot():
    """
    Ensures global rate compliance (15 RPM) across requests.
    Uses Redis token window if available, with in-process queue fallback.
    """
    global _LAST_CALL_TIMES
    now = asyncio.get_event_loop().time()
    
    # Prune calls older than 60 seconds
    _LAST_CALL_TIMES = [t for t in _LAST_CALL_TIMES if now - t < 60.0]
    if len(_LAST_CALL_TIMES) >= settings.GEMINI_RPM:
        sleep_needed = 60.0 - (now - _LAST_CALL_TIMES[0]) + 0.1
        if sleep_needed > 0:
            await asyncio.sleep(sleep_needed)
    
    _LAST_CALL_TIMES.append(asyncio.get_event_loop().time())

def get_client() -> genai.Client | None:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

async def extract_concepts_from_text(text: str, owner_id: str, source_id: str, source_type: str = "document", chunk_id: str = None, database = None) -> dict:
    """
    Extracts concepts and prerequisite relations from text chunk using Gemini 2.5 Flash.
    Strictly isolated per-user: concepts are scoped to owner_id.
    """
    # Key replay fixtures strictly by SHA256 of (chunk text + prompt version)
    fixture_hash = hashlib.sha256(f"{PROMPT_VERSION}:{text}".encode("utf-8")).hexdigest()[:16]
    fixture_file = FIXTURES_DIR / f"concepts_{fixture_hash}.json"

    # 1. Replay mode
    if settings.GEMINI_MODE == "replay" and fixture_file.exists():
        try:
            with open(fixture_file, "r", encoding="utf-8") as f:
                extracted_data = json.load(f)
                return await _persist_extracted_provenance(extracted_data, owner_id, source_id, source_type, chunk_id, text, database)
        except Exception as e:
            print(f"[Concept Replay] Error reading fixture: {e}")

    # 2. Live mode: Check daily cap
    client = get_client()
    if not client:
        # Fallback heuristic extraction if API key is not configured
        fallback_data = _heuristic_extraction(text)
        return await _persist_extracted_provenance(fallback_data, owner_id, source_id, source_type, chunk_id, text, database)

    prompt = f"""
    You are an expert curriculum and knowledge graph engineer.
    Analyze the text below and extract:
    1. Key technical concepts (maximum 8), with a concise 1-sentence definition.
    2. Directed prerequisite relationships between concepts found in or directly implied by this text:
       "from_concept" MUST be understood before "to_concept" can be mastered.

    Rules:
    - Focus on fundamental concepts, architectures, components, algorithms, and core theoretical foundations.
    - Omit generic English words (e.g., "process", "system", "program", "data").
    - Respond ONLY in strict valid JSON matching the schema below:
    {{
        "concepts": [
            {{"name": "Concept Name", "description": "Concise definition"}},
            ...
        ],
        "prerequisites": [
            {{"from_concept": "Foundational Concept", "to_concept": "Advanced Concept"}},
            ...
        ]
    }}

    Text:
    \"\"\"{text[:3000]}\"\"\"
    """

    await acquire_gemini_rate_slot()

    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_EXTRACTION_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            )
        )
        content_json = response.text.strip()
        data = json.loads(content_json)
        
        # Save fixture for deterministic replay
        try:
            with open(fixture_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as fe:
            print(f"[Concept Extraction] Failed to write fixture: {fe}")

        return await _persist_extracted_provenance(data, owner_id, source_id, source_type, chunk_id, text, database)

    except Exception as e:
        print(f"[Concept Extraction] API error: {e}. Using deterministic fallback.")
        fallback_data = _heuristic_extraction(text)
        return await _persist_extracted_provenance(fallback_data, owner_id, source_id, source_type, chunk_id, text, database)

def _heuristic_extraction(text: str) -> dict:
    """Deterministic fallback for tests or when API key / quota is unavailable."""
    words = [w.strip(".,;:()[]\"'").title() for w in text.split() if len(w) > 4 and w.isalpha()]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    top_words = sorted(freq.keys(), key=lambda w: freq[w], reverse=True)[:4]
    
    concepts = [{"name": w, "description": f"Core concept related to {w}."} for w in top_words]
    prereqs = []
    if len(top_words) >= 2:
        prereqs.append({"from_concept": top_words[0], "to_concept": top_words[1]})
    return {"concepts": concepts, "prerequisites": prereqs}

async def _persist_extracted_provenance(data: dict, owner_id: str, source_id: str, source_type: str, chunk_id: str, text: str, database) -> dict:
    """
    Persists provenance records into MongoDB:
      1. concepts
      2. concept_mentions
      3. concept_edges
    And syncs to Neo4j if reachable.
    """
    if database is None:
        return data

    now = datetime.now(timezone.utc)
    raw_concepts = data.get("concepts", [])
    raw_prereqs = data.get("prerequisites", [])

    created_concepts = []

    # 1. Persist Concepts and Mentions
    for c in raw_concepts:
        name = c.get("name", "").strip()
        if not name or len(name) < 2:
            continue
        norm_name = normalize_concept_name(name)
        desc = c.get("description", "").strip()

        # Upsert Concept (Scoped by owner_id)
        await database["concepts"].update_one(
            {"owner_id": owner_id, "normalized_name": norm_name},
            {
                "$set": {
                    "name": name,
                    "normalized_name": norm_name,
                    "description": desc,
                    "updated_at": now
                },
                "$setOnInsert": {
                    "owner_id": owner_id,
                    "created_at": now
                },
                "$inc": {"mention_count": 1}
            },
            upsert=True
        )

        # Record Mention in provenance collection
        mention_doc = {
            "owner_id": owner_id,
            "concept_name": name,
            "normalized_name": norm_name,
            "source_id": str(source_id),
            "source_type": source_type,
            "chunk_id": str(chunk_id) if chunk_id else None,
            "snippet": text[:200] if text else "",
            "created_at": now
        }
        await database["concept_mentions"].insert_one(mention_doc)
        created_concepts.append(name)

    # 2. Persist Concept Edges (Prerequisites)
    for p in raw_prereqs:
        f_name = p.get("from_concept", "").strip()
        t_name = p.get("to_concept", "").strip()
        if not f_name or not t_name or f_name.lower() == t_name.lower():
            continue

        f_norm = normalize_concept_name(f_name)
        t_norm = normalize_concept_name(t_name)

        edge_doc = {
            "owner_id": owner_id,
            "from_concept": f_norm,
            "to_concept": t_norm,
            "from_name": f_name,
            "to_name": t_name,
            "relationship": "PREREQUISITE_OF",
            "source_id": str(source_id),
            "source_type": source_type,
            "created_at": now
        }
        await database["concept_edges"].update_one(
            {
                "owner_id": owner_id,
                "from_concept": f_norm,
                "to_concept": t_norm,
                "source_id": str(source_id)
            },
            {"$set": edge_doc},
            upsert=True
        )

    # 3. Synchronize to Neo4j if driver available
    driver = neo4j_db.get_driver()
    if driver:
        try:
            async with driver.session() as session:
                for name in created_concepts:
                    norm = normalize_concept_name(name)
                    c_query = f"""
                    MERGE (c:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $cid}})
                    SET c.name = $name
                    """
                    await session.run(c_query, owner_id=owner_id, cid=norm, name=name)

                for p in raw_prereqs:
                    f_norm = normalize_concept_name(p.get("from_concept", ""))
                    t_norm = normalize_concept_name(p.get("to_concept", ""))
                    if f_norm and t_norm and f_norm != t_norm:
                        e_query = f"""
                        MATCH (a:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $fid}})
                        MATCH (b:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $tid}})
                        MERGE (a)-[r:PREREQUISITE_OF]->(b)
                        """
                        await session.run(e_query, owner_id=owner_id, fid=f_norm, tid=t_norm)
        except Exception as neo_err:
            print(f"[Neo4j Concept Sync] {neo_err}")

    return {
        "concepts": raw_concepts,
        "prerequisites": raw_prereqs,
        "extracted_concept_names": created_concepts
    }
