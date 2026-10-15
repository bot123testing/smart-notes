from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from app.models.user import User
from app.api.deps import get_current_user
from app.services import ai_service

router = APIRouter()

class MagicTagRequest(BaseModel):
    title: str = ""
    content: str = ""

@router.post("/magic-tags", response_model=List[str])
async def get_magic_tags(
    request: MagicTagRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Uses Gemini 3.0 Flash to automatically generate tags based on note content.
    """
    if not request.title.strip() and not request.content.strip():
        raise HTTPException(status_code=400, detail="Note must have title or content to tag")
        
    tags = await ai_service.auto_tag_note(request.title, request.content)
    return tags
