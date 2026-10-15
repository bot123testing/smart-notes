import os
import json
from google import genai
from google.genai import types
from app.core.config import settings


def get_client() -> genai.Client | None:
    api_key = os.getenv("GEMINI_API_KEY", getattr(settings, "GEMINI_API_KEY", ""))
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception:
        return None


def extract_fallback_tags(title: str, content: str) -> list[str]:
    """
    Local NLP fallback keyword extraction (TF-IDF based) if Gemini API key
    is missing, expired, or offline.
    """
    try:
        from app.services.nlp_service import _tokenise, _term_freq
        tokens = _tokenise(f"{title} {content}")
        tf = _term_freq(tokens)
        sorted_tokens = sorted(tf.keys(), key=lambda t: (tf[t], len(t)), reverse=True)
        fallback_tags = [t for t in sorted_tokens if len(t) >= 4][:4]
        if fallback_tags:
            return fallback_tags
    except Exception as nlp_err:
        print(f"[AI Service] Fallback error: {nlp_err}")

    return ["notes", "knowledge"]


async def auto_tag_note(title: str, content: str) -> list[str]:
    """
    Uses Google Gemini Flash to intelligently extract 3-5 relevant taxonomy tags.
    Falls back gracefully to local NLP taxonomy if API key is invalid or offline.
    """
    client = get_client()
    if not client:
        return extract_fallback_tags(title, content)

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

    try:
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            )
        )
        
        text = response.text.strip()
        tags = json.loads(text)
        
        if isinstance(tags, list):
            clean_tags = []
            for t in tags:
                sanitized = "".join(c for c in str(t).lower() if c.isalnum() or c == '-')
                if sanitized and sanitized not in clean_tags:
                    clean_tags.append(sanitized)
            if clean_tags:
                return clean_tags[:5]
    except Exception as e:
        print(f"[AI Service] Gemini error ({e}), activating local NLP fallback...")

    return extract_fallback_tags(title, content)
