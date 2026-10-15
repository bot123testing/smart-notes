from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class KnowledgeMetric(BaseModel):
    """Stored in the knowledge_metrics collection — one document per note per user."""
    note_id: str
    user_id: str
    importance_score: float       # edit_frequency * 2 + link_count
    access_count: int             # total view+edit events from user_activity
    last_accessed: Optional[datetime] = None
    memory_decay: float           # 0.0 (fresh) → 1.0 (long forgotten)
    computed_at: datetime


class NoteRecommendation(BaseModel):
    """A single note in the recommendations response."""
    note_id: str
    title: str
    importance_score: float
    access_count: int
    last_accessed: Optional[datetime]
    memory_decay: float           # Higher = needs review sooner
    linked_note_count: int


class RecommendationsResponse(BaseModel):
    notes: list[NoteRecommendation]
    total: int
