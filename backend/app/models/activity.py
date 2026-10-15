from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from enum import Enum


class ActionType(str, Enum):
    view = "view"
    edit = "edit"
    create = "create"
    delete = "delete"
    link = "link"
    unlink = "unlink"


class ActivityEvent(BaseModel):
    """Represents a single activity event — written to the user_activity collection."""
    user_id: str
    note_id: str
    action_type: ActionType
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class NoteActivityStats(BaseModel):
    """Per-note activity summary returned by GET /api/activity/stats."""
    note_id: str
    note_title: str
    view_count: int = 0
    edit_count: int = 0
    create_count: int = 0
    delete_count: int = 0
    link_count: int = 0
    unlink_count: int = 0
    total: int = 0
    last_accessed: Optional[datetime] = None


class ActivityStatsResponse(BaseModel):
    """Top-level response from GET /api/activity/stats."""
    total_events: int
    notes: list[NoteActivityStats]


class TimelineDataPoint(BaseModel):
    """Data point for Knowledge Growth over time."""
    date: str  # YYYY-MM-DD
    count: int

class TimelineResponse(BaseModel):
    """Response for GET /api/activity/timeline."""
    timeline: list[TimelineDataPoint]
