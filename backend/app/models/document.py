from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class DocumentStatus(str, Enum):
    uploaded = "uploaded"
    text_extracted = "text_extracted"
    concepts_extracted = "concepts_extracted"
    indexed_es = "indexed_es"
    graphed_neo4j = "graphed_neo4j"
    ready = "ready"
    failed = "failed"
    deleting = "deleting"

class DocumentBase(BaseModel):
    filename: str
    file_size_bytes: int
    page_count: int

class DocumentResponse(BaseModel):
    id: str
    owner_id: str
    filename: str
    file_size_bytes: int
    page_count: int
    file_sha256: str
    status: DocumentStatus
    error_message: Optional[str] = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime

class ChunkResponse(BaseModel):
    id: str
    document_id: str
    owner_id: str
    chunk_index: int
    page_number: int
    text: str
    content_hash: str
    extraction_status: str
    extracted_concepts: List[str] = []
