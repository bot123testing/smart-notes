from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class LinkedNoteMeta(BaseModel):
    """Lightweight summary of a linked note — returned when populating links."""
    id: str
    title: str


class SuggestedLink(BaseModel):
    """An automatically suggested related note produced by TF-IDF cosine similarity."""
    note_id: str
    title: str
    score: float   # cosine similarity score [0, 1]


class NoteBase(BaseModel):
    title: str
    content: str
    tags: List[str] = []
    linked_note_ids: List[str] = []


class NoteCreate(NoteBase):
    pass


class Note(NoteBase):
    id: Optional[str] = Field(default=None)
    owner_id: str
    created_at: datetime
    updated_at: datetime
    # Populated at read-time; not stored in MongoDB
    linked_notes: List[LinkedNoteMeta] = []
    # Stored in MongoDB; computed on create/update by nlp_service
    suggested_links: List[SuggestedLink] = []

    @classmethod
    def from_mongo(cls, data: dict, linked_notes: List[LinkedNoteMeta] = None) -> "Note":
        """Convert a MongoDB document (with _id ObjectId) to a Note model."""
        if data is None:
            return None
        data = dict(data)
        oid = data.pop("_id", None)
        if oid is not None:
            data["id"] = str(oid)
        # Normalise owner_id
        if "owner_id" in data and not isinstance(data["owner_id"], str):
            data["owner_id"] = str(data["owner_id"])
        # Normalise linked_note_ids — coerce any ObjectIds to strings
        raw_ids = data.get("linked_note_ids", [])
        data["linked_note_ids"] = [str(x) for x in raw_ids]
        # Attach populated linked note metadata
        data["linked_notes"] = linked_notes or []
        # Deserialise suggested_links from raw dicts
        raw_suggestions = data.get("suggested_links", [])
        data["suggested_links"] = [
            SuggestedLink(**s) if isinstance(s, dict) else s
            for s in raw_suggestions
        ]
        return cls(**data)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
