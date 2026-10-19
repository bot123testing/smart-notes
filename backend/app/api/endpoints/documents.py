import os
from pathlib import Path
from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.models.user import User
from app.models.document import DocumentResponse, DocumentDetailResponse, ChunkResponse, ConceptItem
from app.api.deps import get_current_user
from app.db.mongodb import db
from app.db.elasticsearch_db import elasticsearch_db
from app.db.neo4j_db import neo4j_db
from app.core.config import settings
from app.services.document_service import process_and_save_upload, UPLOAD_DIR
from app.services.pipeline_service import run_document_pipeline
from app.models.study_path import RelatedContentResponse
from app.services.study_path_service import get_related_content

router = APIRouter()

class UpdateDocumentTagsRequest(BaseModel):
    tags: List[str] = Field(default_factory=list)

def _to_doc_response(doc: dict) -> DocumentResponse:
    return DocumentResponse(
        id=str(doc["_id"]),
        owner_id=doc["owner_id"],
        filename=doc["filename"],
        file_size_bytes=doc["file_size_bytes"],
        page_count=doc["page_count"],
        file_sha256=doc["file_sha256"],
        status=doc["status"],
        error_message=doc.get("error_message"),
        chunk_count=doc.get("chunk_count", 0),
        tags=doc.get("tags", []),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Streaming PDF upload endpoint:
      1. Verifies %PDF- magic bytes, size cap, page cap, and sha256 dedupe.
      2. Streams directly to temp file and cleans up on any error.
      3. Creates document record in MongoDB.
      4. Spawns asynchronous extraction pipeline.
    """
    database = db.get_db()
    doc_record = await process_and_save_upload(file, current_user.id, database)
    
    # Spawn background processing pipeline
    background_tasks.add_task(run_document_pipeline, str(doc_record["_id"]), database)

    return _to_doc_response(doc_record)

@router.get("", response_model=List[DocumentResponse])
async def list_documents(current_user: User = Depends(get_current_user)):
    """List all documents owned by the authenticated user."""
    database = db.get_db()
    docs = await database["documents"].find({"owner_id": current_user.id}).sort("created_at", -1).to_list(length=100)
    return [_to_doc_response(d) for d in docs]

@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(document_id: str, current_user: User = Depends(get_current_user)):
    """Get single document status, chunks, and extracted concepts (ownership strictly checked)."""
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    database = db.get_db()
    doc = await database["documents"].find_one({"_id": oid, "owner_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    base = _to_doc_response(doc)

    # 1. Fetch chunks
    raw_chunks = await database["chunks"].find({"document_id": str(oid)}).sort("chunk_index", 1).to_list(length=500)
    chunks_out = [
        ChunkResponse(
            id=str(c["_id"]),
            document_id=c["document_id"],
            owner_id=c.get("owner_id", current_user.id),
            chunk_index=c.get("chunk_index", 0),
            page_number=c.get("page_number", 1),
            text=c.get("text", ""),
            content_hash=c.get("content_hash"),
            extraction_status=c.get("extraction_status", "ready"),
            extracted_concepts=c.get("extracted_concepts", []),
            word_count=c.get("word_count"),
            token_count=c.get("token_count")
        )
        for c in raw_chunks
    ]

    # 2. Fetch extracted concepts via mentions and concepts collection
    mentions = await database["concept_mentions"].find({
        "owner_id": current_user.id,
        "source_id": str(oid)
    }).to_list(length=500)

    concept_norms = list({m["normalized_name"] for m in mentions if "normalized_name" in m})
    concepts_meta = {}
    if concept_norms:
        cdocs = await database["concepts"].find({
            "owner_id": current_user.id,
            "normalized_name": {"$in": concept_norms}
        }).to_list(length=500)
        for cd in cdocs:
            concepts_meta[cd["normalized_name"]] = cd

    concepts_out = []
    seen_concepts = set()
    for m in mentions:
        norm = m.get("normalized_name")
        if norm and norm not in seen_concepts:
            seen_concepts.add(norm)
            meta = concepts_meta.get(norm, {})
            concepts_out.append(ConceptItem(
                name=meta.get("name") or m.get("concept_name", norm),
                normalized_name=norm,
                description=meta.get("description"),
                mention_count=meta.get("mention_count", 1)
            ))

    # 3. Fetch explicit links
    linked_raw = doc.get("linked_ids", [])
    linked_items = []
    for lid in linked_raw:
        if ObjectId.is_valid(lid):
            ldoc = await database["documents"].find_one({"_id": ObjectId(lid)})
            if ldoc:
                linked_items.append({"id": lid, "title": ldoc.get("filename", "PDF Document"), "type": "document"})
            else:
                lnote = await database["notes"].find_one({"_id": ObjectId(lid)})
                if lnote:
                    linked_items.append({"id": lid, "title": lnote.get("title", "Text Note"), "type": "note"})

    return DocumentDetailResponse(
        **base.model_dump(),
        chunks=chunks_out,
        concepts=concepts_out,
        linked_items=linked_items,
        download_url=f"/api/documents/{str(oid)}/file"
    )

@router.get("/{document_id}/file")
async def download_document_file(document_id: str, current_user: User = Depends(get_current_user)):
    """Download stored document file with strict ownership verification."""
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    database = db.get_db()
    doc = await database["documents"].find_one({"_id": oid, "owner_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = UPLOAD_DIR / Path(doc["storage_path"]).name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File content not found on server")

    return FileResponse(
        path=str(file_path),
        filename=doc["filename"],
        media_type="application/pdf"
    )

@router.put("/{document_id}/tags", response_model=DocumentResponse)
async def update_document_tags(
    document_id: str,
    payload: UpdateDocumentTagsRequest,
    current_user: User = Depends(get_current_user)
):
    """Updates user-editable tags on a PDF document."""
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    database = db.get_db()
    clean_tags = []
    for t in payload.tags:
        s_tag = t.strip().lower()
        if s_tag and s_tag not in clean_tags:
            clean_tags.append(s_tag)

    now = datetime.now(timezone.utc)
    res = await database["documents"].find_one_and_update(
        {"_id": oid, "owner_id": current_user.id},
        {"$set": {"tags": clean_tags, "updated_at": now}},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Document not found")

    return _to_doc_response(res)

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, current_user: User = Depends(get_current_user)):
    """
    Deletes document and cascades cleanup across MongoDB provenance, Neo4j, and filesystem.
    Removes orphan concepts that no longer have any active mentions or edges.
    """
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    database = db.get_db()
    doc = await database["documents"].find_one({"_id": oid, "owner_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Mark as deleting state
    await database["documents"].update_one({"_id": oid}, {"$set": {"status": "deleting"}})

    # 1. Collect affected concept normalized names before deleting mentions
    mentions = await database["concept_mentions"].find({
        "owner_id": current_user.id,
        "source_id": str(oid)
    }).to_list(length=1000)
    affected_concepts = {m["normalized_name"] for m in mentions}

    # 2. Delete chunks, mentions, and edges for this document
    await database["chunks"].delete_many({"document_id": str(oid)})
    await database["concept_mentions"].delete_many({"owner_id": current_user.id, "source_id": str(oid)})
    await database["concept_edges"].delete_many({"owner_id": current_user.id, "source_id": str(oid)})

    # 3. Clean up orphan concepts (no mentions and no edges left for this owner)
    for c_norm in affected_concepts:
        has_mentions = await database["concept_mentions"].find_one({"owner_id": current_user.id, "normalized_name": c_norm})
        has_edges = await database["concept_edges"].find_one({
            "owner_id": current_user.id,
            "$or": [{"from_concept": c_norm}, {"to_concept": c_norm}]
        })
        if not has_mentions and not has_edges:
            await database["concepts"].delete_one({"owner_id": current_user.id, "normalized_name": c_norm})
            # Remove from Neo4j
            driver = neo4j_db.get_driver()
            if driver:
                try:
                    async with driver.session() as session:
                        q = f"MATCH (c:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $cid}}) DETACH DELETE c"
                        await session.run(q, owner_id=current_user.id, cid=c_norm)
                except Exception as ne:
                    print(f"[Neo4j Concept Delete] {ne}")

    # 4. Delete ES document if available
    es = elasticsearch_db.get_client()
    if es:
        try:
            await es.delete(index=f"{settings.ES_INDEX_PREFIX}documents", id=str(oid))
        except Exception:
            pass

    # 5. Delete Neo4j Document node if available
    driver = neo4j_db.get_driver()
    if driver:
        try:
            async with driver.session() as session:
                q = f"MATCH (d:{settings.NEO4J_LABEL_PREFIX}Document {{owner_id: $owner_id, id: $did}}) DETACH DELETE d"
                await session.run(q, owner_id=current_user.id, did=str(oid))
        except Exception:
            pass

    # 6. Delete file from storage
    file_path = UPLOAD_DIR / Path(doc["storage_path"]).name
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    # 7. Delete Document record
    await database["documents"].delete_one({"_id": oid})
    return None


@router.get("/{document_id}/related", response_model=RelatedContentResponse)
async def get_document_related_content(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Returns related documents and notes sharing concepts and/or text similarity with this document.
    """
    database = db.get_db()
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format")
    doc = await database["documents"].find_one({"_id": oid, "owner_id": current_user.id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found."
        )

    return await get_related_content(document_id, "document", current_user.id, database)


class DocumentLinkRequest(BaseModel):
    target_id: str
    target_type: str = "document"  # "document" or "note"

@router.post("/{document_id}/link")
async def link_document(
    document_id: str,
    body: DocumentLinkRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Bidirectionally links document_id ↔ target_id (note or document).
    """
    database = db.get_db()
    d_oid = ObjectId(document_id)
    doc = await database["documents"].find_one({"_id": d_oid, "owner_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    t_oid = ObjectId(body.target_id)
    if body.target_type == "document":
        target_doc = await database["documents"].find_one({"_id": t_oid, "owner_id": current_user.id})
        if not target_doc:
            raise HTTPException(status_code=404, detail="Target document not found")
        await database["documents"].update_one({"_id": d_oid}, {"$addToSet": {"linked_ids": body.target_id}})
        await database["documents"].update_one({"_id": t_oid}, {"$addToSet": {"linked_ids": document_id}})
    else:
        target_note = await database["notes"].find_one({"_id": t_oid, "owner_id": current_user.id})
        if not target_note:
            raise HTTPException(status_code=404, detail="Target note not found")
        await database["documents"].update_one({"_id": d_oid}, {"$addToSet": {"linked_ids": body.target_id}})
        await database["notes"].update_one({"_id": t_oid}, {"$addToSet": {"linked_note_ids": document_id}})

    # Create relationship in Neo4j if available
    driver = neo4j_db.get_driver()
    if driver:
        lbl_a = f"{settings.NEO4J_LABEL_PREFIX}Document"
        lbl_b = f"{settings.NEO4J_LABEL_PREFIX}Document" if body.target_type == "document" else f"{settings.NEO4J_LABEL_PREFIX}Note"
        q = f"""
        MATCH (a:{lbl_a} {{id: $id1}})
        MATCH (b:{lbl_b} {{id: $id2}})
        MERGE (a)-[:RELATED_TO]->(b)
        """
        try:
            async with driver.session() as session:
                await session.run(q, id1=document_id, id2=body.target_id)
        except Exception as ne:
            print(f"[Neo4j Document Link Error] {ne}")

    return {"status": "linked", "source_id": document_id, "target_id": body.target_id}

@router.delete("/{document_id}/unlink")
async def unlink_document(
    document_id: str,
    body: DocumentLinkRequest,
    current_user: User = Depends(get_current_user)
):
    database = db.get_db()
    d_oid = ObjectId(document_id)
    t_oid = ObjectId(body.target_id)
    await database["documents"].update_one({"_id": d_oid}, {"$pull": {"linked_ids": body.target_id}})
    if body.target_type == "document":
        await database["documents"].update_one({"_id": t_oid}, {"$pull": {"linked_ids": document_id}})
    else:
        await database["notes"].update_one({"_id": t_oid}, {"$pull": {"linked_note_ids": document_id}})
    return {"status": "unlinked"}


