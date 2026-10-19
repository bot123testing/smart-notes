import hashlib
from pathlib import Path
from datetime import datetime, timezone
from pypdf import PdfReader
from bson import ObjectId
from app.core.config import settings
from app.models.document import DocumentStatus
from app.services.document_service import UPLOAD_DIR

def extract_and_chunk_pdf(doc_record: dict) -> list[dict]:
    """
    Reads the stored PDF file, extracts text page by page, and slices it into
    overlapping word chunks (~400 words with 80 words overlap).
    """
    file_path = UPLOAD_DIR / Path(doc_record["storage_path"]).name
    reader = PdfReader(str(file_path))
    
    chunks = []
    chunk_index = 0
    now = datetime.now(timezone.utc)
    
    words_per_chunk = settings.CHUNK_SIZE_WORDS
    overlap = settings.CHUNK_OVERLAP_WORDS
    step = max(words_per_chunk - overlap, 50)

    for page_idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        # Clean multiple spaces/newlines
        words = page_text.split()
        if not words:
            continue

        if len(words) <= words_per_chunk:
            chunk_text = " ".join(words)
            c_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
            chunks.append({
                "document_id": str(doc_record["_id"]),
                "owner_id": doc_record["owner_id"],
                "chunk_index": chunk_index,
                "page_number": page_idx + 1,
                "text": chunk_text,
                "content_hash": c_hash,
                "token_count": len(words),
                "extraction_status": "pending",
                "extracted_concepts": [],
                "error_message": None,
                "locked_until": None,
                "created_at": now,
                "updated_at": now
            })
            chunk_index += 1
        else:
            for start in range(0, len(words), step):
                chunk_slice = words[start:start + words_per_chunk]
                if not chunk_slice:
                    break
                chunk_text = " ".join(chunk_slice)
                c_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
                chunks.append({
                    "document_id": str(doc_record["_id"]),
                    "owner_id": doc_record["owner_id"],
                    "chunk_index": chunk_index,
                    "page_number": page_idx + 1,
                    "text": chunk_text,
                    "content_hash": c_hash,
                    "token_count": len(chunk_slice),
                    "extraction_status": "pending",
                    "extracted_concepts": [],
                    "error_message": None,
                    "locked_until": None,
                    "created_at": now,
                    "updated_at": now
                })
                chunk_index += 1
                if start + words_per_chunk >= len(words):
                    break

    return chunks

async def process_document_chunking(doc_id: str, database) -> int:
    """
    Extracts text and persists chunks to the `chunks` collection.
    Transitions document status to `text_extracted`.
    """
    oid = ObjectId(doc_id) if isinstance(doc_id, str) else doc_id
    doc = await database["documents"].find_one({"_id": oid})
    if not doc:
        return 0

    chunks = extract_and_chunk_pdf(doc)
    if chunks:
        await database["chunks"].insert_many(chunks)

    now = datetime.now(timezone.utc)
    await database["documents"].update_one(
        {"_id": oid},
        {"$set": {
            "status": DocumentStatus.text_extracted.value,
            "chunk_count": len(chunks),
            "updated_at": now
        }}
    )
    return len(chunks)
