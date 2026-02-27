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

    try:
        # Use synchronous SDK directly for simplicity inside thread pool later, or standard async wrapper
        # The new SDK `client.models.generate_content_async` handles async natively.
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash-lite',
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
            return clean_tags[:5]
            
        return []
    except Exception as e:
        print(f"[AI Service] Error generating tags: {e}")
        return []
