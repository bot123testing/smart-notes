import os
import re
import json
from google import genai
from google.genai import types
from app.core.config import settings

def get_client() -> genai.Client | None:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

KEYWORD_TAG_MAP = {
    "cloud computing": "cloud-computing",
    "virtualization": "virtualization",
    "hypervisor": "hypervisor",
    "virtual machine": "virtual-machines",
    "virtual machines": "virtual-machines",
    "containerization": "containers",
    "iaas": "iaas",
    "paas": "paas",
    "saas": "saas",
    "public cloud": "public-cloud",
    "private cloud": "private-cloud",
    "hybrid cloud": "hybrid-cloud",
    "distributed systems": "distributed-systems",
    "consensus": "consensus",
    "leader election": "leader-election",
    "raft": "raft",
    "paxos": "paxos",
    "byzantine": "byzantine-fault-tolerance",
    "caching": "caching",
    "redis": "redis",
    "database": "database",
    "sharding": "sharding",
    "replication": "replication",
    "cybersecurity": "cybersecurity",
    "security": "security",
    "encryption": "encryption",
    "authentication": "authentication",
    "authorization": "authorization",
    "scalability": "scalability"
}

TAG_STOPWORDS = {
    "their", "these", "those", "which", "modern", "transformed", "several", "include",
    "including", "approach", "technology", "system", "program", "process", "using",
    "between", "another", "important", "different", "various", "about", "after", "before",
    "where", "there", "because", "while", "being", "under", "common", "allows", "enables",
    "requires", "however", "through", "without", "example", "notes", "title", "content"
}

def _fallback_magic_tags(title: str, content: str) -> list[str]:
    combined = f"{title} {content}".lower()
    tags = []
    
    # 1. Match against known technical keyword tags
    for kw, tag in KEYWORD_TAG_MAP.items():
        if re.search(r'\b' + re.escape(kw) + r'\b', combined):
            if tag not in tags:
                tags.append(tag)
        if len(tags) >= 5:
            break

    # 2. If fewer than 3 tags found, extract prominent words
    if len(tags) < 3:
        words = re.findall(r'[a-zA-Z]{4,}', combined)
        for w in words:
            if w not in TAG_STOPWORDS and w not in tags:
                tags.append(w)
            if len(tags) >= 4:
                break

    return tags[:5]

async def auto_tag_note(title: str, content: str) -> list[str]:
    """
    Uses Gemini 2.5 Flash to extract 3-5 relevant tags, with intelligent deterministic fallback.
    """
    client = get_client()
    if not client:
        return _fallback_magic_tags(title, content)

    prompt = f"""
    You are a precision taxonomy AI classification system.
    Extract the 3 to 5 most significant thematic keywords from the user's note below to be used as organizational tags.
    
    Rules:
    - Return ONLY a raw JSON array of strings (e.g., ["react", "frontend", "optimization"])
    - All tags must be lowercase, single words, with no spaces.
    - Omit any conversational text or markdown formatting blocks (like ```json).
    - Favor specific technical or conceptual terms over broad, generic words.
    
    Title: {title}
    Content: {content}
    """

    import hashlib
    from pathlib import Path
    
    # Hash for replay fixture (chunk text + prompt version only)
    fixture_hash = hashlib.sha256(f"v1:{title}\n{content}".encode()).hexdigest()[:16]
    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures" / "gemini_replays"
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    fixture_file = fixtures_dir / f"tags_{fixture_hash}.json"

    # Replay mode: serve from fixture if present
    if settings.GEMINI_MODE == "replay" and fixture_file.exists():
        try:
            with open(fixture_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AI Service Replay] Failed to load fixture: {e}")

    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            )
        )
        
        # Parse the JSON response
        text = response.text.strip()
        tags = json.loads(text)
        
        if isinstance(tags, list):
            clean_tags = []
            for t in tags:
                sanitized = "".join(c for c in str(t).lower() if c.isalnum() or c == '-')
                if sanitized and sanitized not in clean_tags:
                    clean_tags.append(sanitized)
            final_tags = clean_tags[:5]
            
            try:
                with open(fixture_file, "w", encoding="utf-8") as f:
                    json.dump(final_tags, f, indent=2)
            except Exception as e:
                print(f"[AI Service] Failed to save replay fixture: {e}")

            return final_tags
            
        return _fallback_magic_tags(title, content)
    except Exception as e:
        print(f"[AI Service] Error generating tags: {e}. Using deterministic fallback.")
        return _fallback_magic_tags(title, content)
