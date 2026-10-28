import os
import uuid
import hashlib
import re
from pathlib import Path
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException, status
from pypdf import PdfReader
from app.core.config import settings
from app.models.document import DocumentStatus

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def sanitize_filename(filename: str) -> str:
    # Remove path traversal, directory separators, and unwanted characters
    clean = os.path.basename(filename)
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', clean)
    return clean[:100]

async def process_and_save_upload(file: UploadFile, owner_id: str, database) -> dict:
    """
    Streams upload to a temporary file while hashing and counting bytes.
    Enforces %PDF- magic bytes check, size cap, and page cap.
    Guarantees temp file cleanup on any failure.
    """
    temp_filename = f"temp_{uuid.uuid4().hex}.pdf"
    temp_path = UPLOAD_DIR / temp_filename
    
    sha256_hasher = hashlib.sha256()
    total_bytes = 0
    first_chunk = True

    try:
        with open(temp_path, "wb") as f_out:
            while chunk := await file.read(65536):
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB."
                    )
                
                # Check magic bytes on first chunk
                if first_chunk:
                    if not chunk.startswith(b"%PDF-"):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid PDF file format. %PDF- magic bytes header required."
                        )
                    first_chunk = False

                sha256_hasher.update(chunk)
                f_out.write(chunk)

        if total_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file uploaded."
            )

        file_sha256 = sha256_hasher.hexdigest()

        # Check for duplicate document for this owner
        existing = await database["documents"].find_one({
            "owner_id": owner_id,
            "file_sha256": file_sha256
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A document with this identical content already exists in your library."
            )

        # Inspect page count
        try:
            reader = PdfReader(str(temp_path))
            page_count = len(reader.pages)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse PDF pages: {e}"
            )

        if page_count > settings.MAX_PDF_PAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PDF has {page_count} pages, exceeding the maximum cap of {settings.MAX_PDF_PAGES} pages."
            )

        # Save to permanent sanitized filename
        clean_name = sanitize_filename(file.filename or "uploaded.pdf")
        permanent_name = f"{uuid.uuid4().hex[:12]}_{clean_name}"
        permanent_path = UPLOAD_DIR / permanent_name
        
        # Atomically move temp to permanent
        temp_path.replace(permanent_path)

        now = datetime.now(timezone.utc)
        doc_record = {
            "owner_id": owner_id,
            "filename": file.filename or "uploaded.pdf",
            "storage_path": str(permanent_path.relative_to(UPLOAD_DIR.parent)),
            "file_sha256": file_sha256,
            "file_size_bytes": total_bytes,
            "page_count": page_count,
            "status": DocumentStatus.uploaded.value,
            "error_message": None,
            "chunk_count": 0,
            "locked_until": None,
            "locked_by": None,
            "created_at": now,
            "updated_at": now,
        }

        result = await database["documents"].insert_one(doc_record)
        doc_record["_id"] = result.inserted_id
        return doc_record

    except Exception:
        # Guarantee temp file cleanup on overflow, bad magic bytes, or any error
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass
        raise
