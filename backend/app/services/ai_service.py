import os
import json
from google import genai
from google.genai import types
from app.core.config import settings

def get_client() -> genai.Client | None:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

async def auto_tag_note(title: str, content: str) -> list[str]:
    """
    Uses Gemini 2.5 Flash Lite to intelligently extract 3-5 relevant tags.
    """
    client = get_client()
    if not client:
        return []

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
            # Sanitize: lowercase, alphanumeric
            clean_tags = []
            for t in tags:
                sanitized = "".join(c for c in str(t).lower() if c.isalnum() or c == '-')
                if sanitized and sanitized not in clean_tags:
                    clean_tags.append(sanitized)
            final_tags = clean_tags[:5]
            
            # Record fixture during live run
            try:
                with open(fixture_file, "w", encoding="utf-8") as f:
                    json.dump(final_tags, f, indent=2)
            except Exception as e:
                print(f"[AI Service] Failed to save replay fixture: {e}")

            return final_tags
            
        return []
    except Exception as e:
        print(f"[AI Service] Error generating tags: {e}")
        # In replay mode with no fixture, return sensible deterministic fallback
        if settings.GEMINI_MODE == "replay":
            words = [w.lower() for w in f"{title} {content}".split() if len(w) > 4]
            return list(dict.fromkeys(words))[:3]
        return []
