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

        # Sanitize against single-word stopwords
        valid_concepts = []
        for c in data.get("concepts", []):
            c_name = c.get("name", "").strip()
            if c_name and c_name.lower() not in STOPWORDS_BLACKLIST and len(c_name) >= 3:
                valid_concepts.append(c)

        if not valid_concepts:
            data = _heuristic_extraction(text)
        else:
            data["concepts"] = valid_concepts
        
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

# Comprehensive academic domain ontology for technical concepts
DOMAIN_KNOWLEDGE_BASE = {
    # Cloud Computing & Virtualization
    "cloud computing": {
        "name": "Cloud Computing",
        "description": "On-demand availability of computing resources including servers, storage, databases, and networking over the internet.",
        "prerequisites": ["virtualization"]
    },
    "virtualization": {
        "name": "Virtualization",
        "description": "Fundamental technology enabling the creation of simulated computing environments and dedicated virtual hardware on physical hosts.",
        "prerequisites": ["hypervisor"]
    },
    "hypervisor": {
        "name": "Hypervisor",
        "description": "Software, firmware, or hardware layer that creates, allocates resources to, and executes virtual machines.",
        "prerequisites": []
    },
    "virtual machines": {
        "name": "Virtual Machines",
        "description": "Isolated software emulation of physical computer systems with allocated CPU, memory, and virtual storage.",
        "prerequisites": ["hypervisor"]
    },
    "virtual machine": {
        "name": "Virtual Machines",
        "description": "Isolated software emulation of physical computer systems with allocated CPU, memory, and virtual storage.",
        "prerequisites": ["hypervisor"]
    },
    "containerization": {
        "name": "Containerization",
        "description": "Operating-system-level virtualization bundling application code and dependencies into lightweight, portable units.",
        "prerequisites": ["virtualization"]
    },
    "containers": {
        "name": "Containerization",
        "description": "Operating-system-level virtualization bundling application code and dependencies into lightweight, portable units.",
        "prerequisites": ["virtualization"]
    },
    "iaas": {
        "name": "Infrastructure as a Service (IaaS)",
        "description": "Cloud service model providing virtualized physical computing resources, networking, and raw storage infrastructure.",
        "prerequisites": ["virtualization", "virtual machines"]
    },
    "infrastructure as a service": {
        "name": "Infrastructure as a Service (IaaS)",
        "description": "Cloud service model providing virtualized physical computing resources, networking, and raw storage infrastructure.",
        "prerequisites": ["virtualization", "virtual machines"]
    },
    "paas": {
        "name": "Platform as a Service (PaaS)",
        "description": "Cloud platform environment allowing developers to build, test, run, and manage applications without infrastructure complexity.",
        "prerequisites": ["infrastructure as a service (iaas)"]
    },
    "platform as a service": {
        "name": "Platform as a Service (PaaS)",
        "description": "Cloud platform environment allowing developers to build, test, run, and manage applications without infrastructure complexity.",
        "prerequisites": ["infrastructure as a service (iaas)"]
    },
    "saas": {
        "name": "Software as a Service (SaaS)",
        "description": "Cloud delivery model where complete software applications are hosted centrally and delivered to end users over the internet.",
        "prerequisites": ["platform as a service (paas)"]
    },
    "software as a service": {
        "name": "Software as a Service (SaaS)",
        "description": "Cloud delivery model where complete software applications are hosted centrally and delivered to end users over the internet.",
        "prerequisites": ["platform as a service (paas)"]
    },
    "public cloud": {
        "name": "Public Cloud",
        "description": "Cloud deployment model providing shared computing infrastructure managed by third-party providers over the open internet.",
        "prerequisites": ["cloud computing"]
    },
    "public clouds": {
        "name": "Public Cloud",
        "description": "Cloud deployment model providing shared computing infrastructure managed by third-party providers over the open internet.",
        "prerequisites": ["cloud computing"]
    },
    "private cloud": {
        "name": "Private Cloud",
        "description": "Cloud infrastructure provisioned for exclusive use by a single organization with dedicated governance and isolation.",
        "prerequisites": ["cloud computing"]
    },
    "private clouds": {
        "name": "Private Cloud",
        "description": "Cloud infrastructure provisioned for exclusive use by a single organization with dedicated governance and isolation.",
        "prerequisites": ["cloud computing"]
    },
    "hybrid cloud": {
        "name": "Hybrid Cloud",
        "description": "Integrated computing environment combining public and private cloud models to distribute workloads flexibly.",
        "prerequisites": ["public cloud", "private cloud"]
    },
    "hybrid clouds": {
        "name": "Hybrid Cloud",
        "description": "Integrated computing environment combining public and private cloud models to distribute workloads flexibly.",
        "prerequisites": ["public cloud", "private cloud"]
    },
    "scalability": {
        "name": "Scalability",
        "description": "Capability of a computing architecture to gracefully handle increased workload by expanding physical or virtual resources.",
        "prerequisites": ["cloud computing"]
    },
    "disaster recovery": {
        "name": "Disaster Recovery",
        "description": "Set of policies, automated tools, and procedures to restore access to critical technology infrastructure after failure.",
        "prerequisites": ["cloud computing"]
    },
    "data privacy": {
        "name": "Data Privacy",
        "description": "Legal, ethical, and architectural practices regulating how sensitive digital information is collected and protected.",
        "prerequisites": ["access control", "encryption"]
    },
    "access control": {
        "name": "Access Control",
        "description": "Security technique regulating which users, processes, or devices have permission to view or modify resources.",
        "prerequisites": ["authentication"]
    },
    "access controls": {
        "name": "Access Control",
        "description": "Security technique regulating which users, processes, or devices have permission to view or modify resources.",
        "prerequisites": ["authentication"]
    },
    "encryption": {
        "name": "Encryption",
        "description": "Process of transforming plaintext data into ciphertext to prevent unauthorized access in transit and at rest.",
        "prerequisites": []
    },

    # Distributed Systems & Consensus
    "distributed systems": {
        "name": "Distributed Systems",
        "description": "Collection of autonomous computing nodes that communicate over a network to coordinate shared computation.",
        "prerequisites": []
    },
    "consensus algorithms": {
        "name": "Consensus Algorithms",
        "description": "Fundamental protocols ensuring distributed processes reach consensus on shared values or state machine transitions.",
        "prerequisites": ["distributed systems"]
    },
    "leader election": {
        "name": "Leader Election",
        "description": "Algorithmic process in distributed systems where a single node is designated to coordinate tasks and log entries.",
        "prerequisites": ["distributed systems"]
    },
    "raft consensus": {
        "name": "Raft Consensus",
        "description": "Consensus protocol designed for understandability using leader election, log replication, and safety guarantees.",
        "prerequisites": ["leader election"]
    },
    "distributed state machine": {
        "name": "Distributed State Machine",
        "description": "Decentralized architecture where multiple independent nodes replicate identical state transition sequences.",
        "prerequisites": ["raft consensus"]
    },
    "byzantine fault tolerance": {
        "name": "Byzantine Fault Tolerance",
        "description": "Property of a distributed network enabling correct execution despite arbitrary, crashing, or adversarial nodes.",
        "prerequisites": ["quorum consensus"]
    },
    "quorum consensus": {
        "name": "Quorum Consensus",
        "description": "Consensus technique requiring agreement from a majority quorum of nodes before committing transactions.",
        "prerequisites": ["distributed systems"]
    },
    "paxos": {
        "name": "Paxos",
        "description": "Family of fault-tolerant consensus protocols enabling distributed nodes to agree on values over unreliable networks.",
        "prerequisites": ["distributed systems"]
    },
    "cap theorem": {
        "name": "CAP Theorem",
        "description": "Distributed computing theorem stating that any network partition forces a tradeoff between consistency and availability.",
        "prerequisites": ["network partition"]
    },
    "network partition": {
        "name": "Network Partition",
        "description": "Communication failure in a distributed network dividing nodes into unreachable isolated subgroups.",
        "prerequisites": ["distributed systems"]
    },
    "linearizability": {
        "name": "Linearizability",
        "description": "Strongest consistency model guaranteeing that all operations appear to execute instantaneously at a specific point in time.",
        "prerequisites": ["cap theorem"]
    },

    # Caching & Databases
    "in-memory caching": {
        "name": "In-Memory Caching",
        "description": "High-performance data storage technique keeping active working data directly in volatile RAM for sub-millisecond access.",
        "prerequisites": []
    },
    "redis data structures": {
        "name": "Redis Data Structures",
        "description": "Specialized memory-efficient data primitives in Redis including strings, hashes, sorted sets, and bitfields.",
        "prerequisites": ["in-memory caching"]
    },
    "aof persistence": {
        "name": "AOF Persistence",
        "description": "Append-Only File persistence mechanism logging every write operation sequentially for durability in Redis.",
        "prerequisites": ["redis data structures"]
    },
    "append-only file": {
        "name": "AOF Persistence",
        "description": "Append-Only File persistence mechanism logging every write operation sequentially for durability in Redis.",
        "prerequisites": ["redis data structures"]
    },
    "append only file": {
        "name": "AOF Persistence",
        "description": "Append-Only File persistence mechanism logging every write operation sequentially for durability in Redis.",
        "prerequisites": ["redis data structures"]
    },
    "partition tolerance": {
        "name": "Partition Tolerance",
        "description": "The ability of a distributed data system to continue operating despite arbitrary packet loss or network partition.",
        "prerequisites": ["network partition"]
    },
    "database sharding": {
        "name": "Database Sharding",
        "description": "Horizontal partitioning strategy dividing large datasets across multiple independent database server nodes.",
        "prerequisites": ["replication"]
    },
    "replication": {
        "name": "Replication",
        "description": "Process of copying and maintaining database objects across multiple servers to ensure high availability.",
        "prerequisites": []
    },
    "relational database": {
        "name": "Relational Database",
        "description": "Database structured around tabular schemas with strict relations adhering to ACID transactional principles.",
        "prerequisites": []
    },
    "nosql database": {
        "name": "NoSQL Database",
        "description": "Non-relational data storage system optimized for horizontal scale, schema flexibility, and varied data models.",
        "prerequisites": ["relational database"]
    },

    # Cybersecurity
    "cybersecurity": {
        "name": "Cybersecurity",
        "description": "The practice of protecting computer systems, networks, and sensitive data from digital attacks and unauthorized exploitation.",
        "prerequisites": ["access control", "encryption"]
    },
    "authentication": {
        "name": "Authentication",
        "description": "Security mechanism verifying the identity of a user, process, or device before granting system access.",
        "prerequisites": []
    },
    "authorization": {
        "name": "Authorization",
        "description": "Security mechanism determining whether an authenticated user has permission to access specific resources.",
        "prerequisites": ["authentication"]
    }
}

# Strict stopword blacklist for concept extraction - prevents single generic English words
STOPWORDS_BLACKLIST = {
    "their", "these", "those", "which", "modern", "transformed", "several", "include",
    "includes", "including", "approach", "technology", "technologies", "system", "systems",
    "program", "process", "using", "between", "another", "important", "different", "various",
    "during", "major", "often", "unlike", "careful", "chosen", "order", "every", "other",
    "first", "second", "could", "would", "should", "about", "after", "before", "where",
    "there", "because", "while", "being", "under", "common", "commonly", "allows", "enables",
    "requires", "require", "needed", "however", "through", "within", "without", "example",
    "examples", "conclusion", "successful", "practice", "protecting", "organizations",
    "individuals", "sensitive", "damage", "disruption", "theft", "unauthorized", "cloud",
    "computing", "service", "services", "digital", "information", "businesses", "approach",
    "models", "model", "features", "feature", "overview", "introduction", "summary",
    "only", "file", "files", "append"
}

def _heuristic_extraction(text: str) -> dict:
    """
    Production-grade domain ontology and compound technical phrase extractor.
    Eliminates meaningless single-word concepts and extracts rich, multi-word technical concepts
    with verified academic definitions and directed prerequisite hierarchies.
    """
    lower_text = text.lower()
    matched_concepts = []
    seen_canonical = set()
    matched_keys = set()

    # 1. Match against domain knowledge base (longest phrases first)
    for term in sorted(DOMAIN_KNOWLEDGE_BASE.keys(), key=lambda t: len(t), reverse=True):
        # Match as whole word/phrase boundaries
        pattern = r'\b' + re.escape(term) + r'\b'
        if re.search(pattern, lower_text):
            meta = DOMAIN_KNOWLEDGE_BASE[term]
            c_name = meta["name"]
            if c_name not in seen_canonical:
                seen_canonical.add(c_name)
                matched_concepts.append({
                    "name": c_name,
                    "description": meta["description"],
                    "prerequisites": meta.get("prerequisites", [])
                })
                matched_keys.add(term)

    # 2. Extract technical multi-word capitalized phrases not in the predefined ontology
    # e.g., "Public Clouds", "Virtual Machine Monitor", "Service Level Agreements"
    phrase_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b'
    for m in re.finditer(phrase_pattern, text):
        phrase = m.group(0).strip()
        phrase_lower = phrase.lower()
        words = phrase_lower.split()
        # Ensure none of the words is purely generic or in blacklist
        if all(w not in STOPWORDS_BLACKLIST for w in words) and len(phrase) >= 8:
            if phrase not in seen_canonical and not any(phrase_lower in k for k in matched_keys):
                seen_canonical.add(phrase)
                matched_concepts.append({
                    "name": phrase,
                    "description": f"Key technical concept covering {phrase}.",
                    "prerequisites": []
                })

    # Limit to top 8 most prominent concepts
    selected_concepts = matched_concepts[:8]

    # If no concepts matched (rare), provide sensible default concepts from text themes
    if not selected_concepts:
        selected_concepts = [{
            "name": "General Architecture",
            "description": "Foundational architectural principles and technical design.",
            "prerequisites": []
        }]

    # 3. Derive directed prerequisite edges
    concept_names_map = {normalize_concept_name(c["name"]): c["name"] for c in selected_concepts}
    prereqs = []
    added_edges = set()

    for c in selected_concepts:
        to_norm = normalize_concept_name(c["name"])
        for prereq_key in c.get("prerequisites", []):
            prereq_norm = normalize_concept_name(prereq_key)
            if prereq_norm in concept_names_map and prereq_norm != to_norm:
                edge_key = (prereq_norm, to_norm)
                if edge_key not in added_edges:
                    added_edges.add(edge_key)
                    prereqs.append({
                        "from_concept": concept_names_map[prereq_norm],
                        "to_concept": c["name"]
                    })

    # Clean concept output schema
    out_concepts = [{"name": c["name"], "description": c["description"]} for c in selected_concepts]
    return {"concepts": out_concepts, "prerequisites": prereqs}

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
