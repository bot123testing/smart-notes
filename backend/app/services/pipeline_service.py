import asyncio
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.core.config import settings
from app.models.document import DocumentStatus
from app.services.chunking_service import process_document_chunking
from app.services.concept_extraction_service import extract_concepts_from_text
from app.db.elasticsearch_db import elasticsearch_db
from app.db.neo4j_db import neo4j_db

WORKER_ID = f"worker_{uuid.uuid4().hex[:8]}"

async def acquire_lease(collection, item_id: ObjectId, worker_id: str) -> bool:
    """Atomically acquires lease on a document or chunk if unlocked or expired."""
    now = datetime.now(timezone.utc)
    lease_deadline = now + timedelta(seconds=settings.LEASE_TIMEOUT_SECONDS)
    
    res = await collection.update_one(
        {
            "_id": item_id,
            "$or": [
                {"locked_until": None},
                {"locked_until": {"$lt": now}}
            ]
        },
        {"$set": {"locked_until": lease_deadline, "locked_by": worker_id}}
    )
    return res.modified_count > 0

async def extend_lease(collection, item_id: ObjectId, worker_id: str):
    """Extends the lease deadline while work is ongoing."""
    now = datetime.now(timezone.utc)
    lease_deadline = now + timedelta(seconds=settings.LEASE_TIMEOUT_SECONDS)
    await collection.update_one(
        {"_id": item_id, "locked_by": worker_id},
        {"$set": {"locked_until": lease_deadline}}
    )

async def release_lease(collection, item_id: ObjectId, worker_id: str):
    """Releases the lease on completion or failure."""
    await collection.update_one(
        {"_id": item_id, "locked_by": worker_id},
        {"$set": {"locked_until": None, "locked_by": None}}
    )

async def startup_recovery_sweep(database):
    """
    Startup sweep that requeues documents in any non-terminal state
    and resets orphaned chunk leases so pipelines never get stuck.
    """
    now = datetime.now(timezone.utc)
    non_terminal = [
        DocumentStatus.uploaded.value,
        DocumentStatus.text_extracted.value,
        DocumentStatus.concepts_extracted.value,
        DocumentStatus.indexed_es.value,
        DocumentStatus.graphed_neo4j.value,
        DocumentStatus.deleting.value
    ]

    # Requeue expired or stuck documents
    doc_res = await database["documents"].update_many(
        {
            "status": {"$in": non_terminal},
            "$or": [
                {"locked_until": None},
                {"locked_until": {"$lt": now}}
            ]
        },
        {"$set": {"locked_until": None, "locked_by": None}}
    )

    # Reset stuck chunk processing leases
    chunk_res = await database["chunks"].update_many(
        {
            "extraction_status": "processing",
            "$or": [
                {"locked_until": None},
                {"locked_until": {"$lt": now}}
            ]
        },
        {"$set": {"extraction_status": "pending", "locked_until": None, "locked_by": None}}
    )
    
    print(f"[Startup Sweep] Requeued {doc_res.modified_count} documents and reset {chunk_res.modified_count} stuck chunks.")

async def run_document_pipeline(doc_id: str, database):
    """
    Executes the full document processing pipeline:
      uploaded -> text_extracted -> concepts_extracted -> indexed_es -> graphed_neo4j -> ready
    Manages periodic heartbeat lease extension.
    """
    oid = ObjectId(doc_id) if isinstance(doc_id, str) else doc_id
    acquired = await acquire_lease(database["documents"], oid, WORKER_ID)
    if not acquired:
        print(f"[Pipeline] Document {doc_id} is already locked by another worker.")
        return

    heartbeat_active = True

    async def heartbeat_loop():
        while heartbeat_active:
            await asyncio.sleep(settings.HEARTBEAT_INTERVAL_SECONDS)
            try:
                await extend_lease(database["documents"], oid, WORKER_ID)
            except Exception as e:
                print(f"[Heartbeat] Error: {e}")

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    try:
        doc = await database["documents"].find_one({"_id": oid})
        if not doc:
            return

        # 1. Text Extraction & Chunking
        if doc["status"] == DocumentStatus.uploaded.value:
            await process_document_chunking(doc["_id"], database)
            doc = await database["documents"].find_one({"_id": oid})

        # 2. Concept Extraction
        if doc["status"] == DocumentStatus.text_extracted.value:
            chunks = await database["chunks"].find({"document_id": str(oid)}).to_list(length=500)
            for ch in chunks:
                await database["chunks"].update_one(
                    {"_id": ch["_id"]},
                    {"$set": {"extraction_status": "processing"}}
                )
                try:
                    res = await extract_concepts_from_text(
                        text=ch["text"],
                        owner_id=doc["owner_id"],
                        source_id=str(oid),
                        source_type="document",
                        chunk_id=str(ch["_id"]),
                        database=database
                    )
                    await database["chunks"].update_one(
                        {"_id": ch["_id"]},
                        {"$set": {
                            "extraction_status": "completed",
                            "extracted_concepts": res.get("extracted_concept_names", [])
                        }}
                    )
                except Exception as ce:
                    await database["chunks"].update_one(
                        {"_id": ch["_id"]},
                        {"$set": {"extraction_status": "failed", "error_message": str(ce)}}
                    )

            await database["documents"].update_one(
                {"_id": oid},
                {"$set": {"status": DocumentStatus.concepts_extracted.value, "updated_at": datetime.now(timezone.utc)}}
            )
            doc = await database["documents"].find_one({"_id": oid})

        # 3. Index to Elasticsearch
        if doc["status"] == DocumentStatus.concepts_extracted.value:
            es = elasticsearch_db.get_client()
            if es:
                chunks = await database["chunks"].find({"document_id": str(oid)}).to_list(length=500)
                combined_text = " ".join(ch["text"] for ch in chunks)
                es_doc = {
                    "id": str(oid),
                    "owner_id": doc["owner_id"],
                    "filename": doc["filename"],
                    "content": combined_text[:100000],
                    "doc_type": "pdf_document"
                }
                try:
                    index_name = f"{settings.ES_INDEX_PREFIX}documents"
                    await es.index(index=index_name, id=str(oid), document=es_doc)
                except Exception as ese:
                    print(f"[Pipeline] ES document indexing failed: {ese}")

            await database["documents"].update_one(
                {"_id": oid},
                {"$set": {"status": DocumentStatus.indexed_es.value, "updated_at": datetime.now(timezone.utc)}}
            )
            doc = await database["documents"].find_one({"_id": oid})

        # 4. Neo4j Graph Synchronization (if available)
        if doc["status"] == DocumentStatus.indexed_es.value:
            driver = neo4j_db.get_driver()
            if driver:
                try:
                    async with driver.session() as session:
                        q = f"""
                        MERGE (d:{settings.NEO4J_LABEL_PREFIX}Document {{owner_id: $owner_id, id: $did}})
                        SET d.filename = $filename
                        """
                        await session.run(q, owner_id=doc["owner_id"], did=str(oid), filename=doc["filename"])
                except Exception as ne:
                    print(f"[Pipeline] Neo4j document node failed: {ne}")

            await database["documents"].update_one(
                {"_id": oid},
                {"$set": {"status": DocumentStatus.graphed_neo4j.value, "updated_at": datetime.now(timezone.utc)}}
            )

        # 5. Mark Ready
        await database["documents"].update_one(
            {"_id": oid},
            {"$set": {"status": DocumentStatus.ready.value, "updated_at": datetime.now(timezone.utc)}}
        )
        print(f"[Pipeline] Document {doc_id} successfully processed and marked READY.")

    except Exception as e:
        print(f"[Pipeline ERROR] Document {doc_id} failed: {e}")
        await database["documents"].update_one(
            {"_id": oid},
            {"$set": {
                "status": DocumentStatus.failed.value,
                "error_message": str(e),
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    finally:
        heartbeat_active = False
        heartbeat_task.cancel()
        await release_lease(database["documents"], oid, WORKER_ID)

async def debounce_and_extract_note_concepts(note_id: str, original_content_hash: str, database):
    """
    Waits 5 seconds (debounce). Verifies the note still exists and its content_hash
    matches the original before invoking Gemini extraction. Non-blocking.
    """
    await asyncio.sleep(5)
    
    oid = ObjectId(note_id) if isinstance(note_id, str) else note_id
    note = await database["notes"].find_one({"_id": oid})
    if not note:
        print(f"[Debounce Note] Note {note_id} no longer exists. Skipping extraction.")
        return

    current_hash = hashlib.sha256(note.get("content", "").encode("utf-8")).hexdigest()
    if current_hash != original_content_hash:
        print(f"[Debounce Note] Content changed during debounce period. Skipping superseded job.")
        return

    content_text = f"{note.get('title', '')}\n\n{note.get('content', '')}"
    if len(content_text.strip()) < 10:
        return

    try:
        await extract_concepts_from_text(
            text=content_text,
            owner_id=note["owner_id"],
            source_id=str(oid),
            source_type="note",
            database=database
        )
        print(f"[Debounce Note] Successfully extracted concepts for Note {note_id}.")
    except Exception as e:
        print(f"[Debounce Note] Extraction error: {e}")
