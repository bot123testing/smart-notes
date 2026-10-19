from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ConceptBase(BaseModel):
    name: str
    description: str = ""

class ConceptResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    normalized_name: str
    description: str = ""
    mention_count: int = 1
    created_at: datetime
    updated_at: datetime

class ConceptMentionModel(BaseModel):
    owner_id: str
    concept_name: str
    normalized_name: str
    source_id: str
    source_type: str  # "document" | "note"
    chunk_id: Optional[str] = None
    snippet: str = ""
    created_at: datetime

class ConceptEdgeModel(BaseModel):
    owner_id: str
    from_concept: str
    to_concept: str
    relationship: str = "PREREQUISITE_OF"
    source_id: str
    source_type: str  # "document" | "note"
    created_at: datetime
