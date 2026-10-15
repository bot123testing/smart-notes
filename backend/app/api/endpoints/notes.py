from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List
from app.models.note import Note, NoteCreate, LinkedNoteMeta, SuggestedLink
from app.models.metrics import RecommendationsResponse
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db
import json
from app.api.activity_logger import log_activity
from app.models.activity import ActionType
from app.services.metrics_service import compute_and_store_metrics
from app.services.recommendation_service import generate_hybrid_recommendations
from app.services import nlp_service
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _to_oid(note_id: str) -> ObjectId:
    """Parse a string into an ObjectId; raise 400 on failure."""
    try:
        return ObjectId(note_id)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid note ID: {note_id}")


async def _get_user_note(database, note_id: str, owner_id: str) -> dict:
    """Fetch a note that belongs to the current user; raise 404 if missing."""
    doc = await database["notes"].find_one(
        {"_id": _to_oid(note_id), "owner_id": owner_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Note not found")
    return doc


async def _populate_links(database, note_doc: dict) -> Note:
    """
    Resolve linked_note_ids → List[LinkedNoteMeta] with a single DB query,
    then return a fully constructed Note object.
    """
    raw_ids = note_doc.get("linked_note_ids", [])
    linked_meta: List[LinkedNoteMeta] = []

    if raw_ids:
        oids = []
        for rid in raw_ids:
            try:
                oids.append(ObjectId(rid))
            except Exception:
                pass  # skip malformed ids gracefully

        if oids:
            cursor = database["notes"].find(
                {"_id": {"$in": oids}},
                {"_id": 1, "title": 1},          # projection → only id + title
            )
            async for doc in cursor:
                linked_meta.append(LinkedNoteMeta(id=str(doc["_id"]), title=doc["title"]))

    return Note.from_mongo(note_doc, linked_notes=linked_meta)


async def _compute_suggestions(database, source_id: str, owner_id: str) -> None:
    """
    Compute TF-IDF cosine similarity between source note and all other user notes.
    Writes top-3 suggestions into the note's `suggested_links` field.
    Fire-and-forget: never raises — failures are logged silently.
    """
    try:
        all_notes = await database["notes"].find(
            {"owner_id": owner_id},
            {"_id": 1, "title": 1, "content": 1},
        ).to_list(length=500)

        # Build corpus: {note_id: "title content"}
        corpus = {str(n["_id"]): f"{n.get('title', '')} {n.get('content', '')}" for n in all_notes}
        title_map = {str(n["_id"]): n.get("title", "") for n in all_notes}

        raw_suggestions = nlp_service.suggest_links(source_id, corpus, top_n=3)

        # Enrich with titles
        suggested_links = [
            {"note_id": s["note_id"], "title": title_map.get(s["note_id"], ""), "score": s["score"]}
            for s in raw_suggestions
        ]

        from bson import ObjectId as OId
        await database["notes"].update_one(
            {"_id": OId(source_id)},
            {"$set": {"suggested_links": suggested_links}},
        )
    except Exception as e:
        print(f"[nlp] Suggestion compute failed for {source_id}: {e}")


# ── request body models ───────────────────────────────────────────────────────

class LinkRequest(BaseModel):
    target_note_id: str


# ── CRUD endpoints ────────────────────────────────────────────────────────────

# NOTE: /recommendations, /graph, and /{id}/suggestions MUST be declared before /{note_id}
# so FastAPI does not treat literal strings as a note_id.
@router.get("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(current_user: User = Depends(get_current_user)):
    """
    Compute hybrid recommendations using Neo4j context and MongoDB memory decay.
    Result is cached in Redis for 15 minutes.
    """
    import traceback
    database = db.get_db()
    r = redis_client.get_redis()
    cache_key = f"user:{current_user.id}:recommendations"
    
    # 1. Attempt Redis cache fetch
    cached_recs = await r.get(cache_key)
    if cached_recs:
        data = json.loads(cached_recs)
        return RecommendationsResponse(**data)
        
    # 2. On miss, generate hybrid recommendations
    try:
        return await generate_hybrid_recommendations(database, current_user.id)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))




@router.get("/", response_model=List[Note])
async def read_notes(current_user: User = Depends(get_current_user)):
    database = db.get_db()
    notes = await database["notes"].find({"owner_id": current_user.id}).to_list(length=100)
    return [await _populate_links(database, note) for note in notes]


@router.get("/{note_id}/suggestions", response_model=List[SuggestedLink])
async def get_note_suggestions(
    note_id: str,
    recompute: bool = False,
    current_user: User = Depends(get_current_user),
):
    """
    Return the top-3 automatically suggested related notes for a given note,
    based on TF-IDF cosine similarity over title + content.

    Pass ?recompute=true to force recomputation (e.g. after bulk edits).
    """
    database = db.get_db()
    note_doc = await _get_user_note(database, note_id, current_user.id)

    if recompute or not note_doc.get("suggested_links"):
        await _compute_suggestions(database, note_id, current_user.id)
        note_doc = await database["notes"].find_one({"_id": _to_oid(note_id)})

    raw = note_doc.get("suggested_links", [])
    return [SuggestedLink(**s) if isinstance(s, dict) else s for s in raw]


@router.get("/recent", response_model=List[Note])
async def read_recent_notes(current_user: User = Depends(get_current_user)):
    database = db.get_db()
    r = redis_client.get_redis()
    recent_key = f"user:{current_user.id}:recent_notes"
    
    # get recently viewed note IDs from redis list
    recent_note_ids = await r.lrange(recent_key, 0, -1)
    if not recent_note_ids:
        return []
        
    oids = []
    for rid in recent_note_ids:
        try:
            oids.append(ObjectId(rid))
        except Exception:
            pass
            
    if not oids:
        return []
        
    notes_cursor = database["notes"].find({"_id": {"$in": oids}})
    notes_map = {str(n["_id"]): n async for n in notes_cursor}
    
    # Return notes preserving recent order
    ordered_notes = []
    for rid in recent_note_ids:
        if rid in notes_map:
            doc = notes_map[rid]
            ordered_notes.append(await _populate_links(database, doc))
            
    return ordered_notes


@router.get("/similar/{note_id}", response_model=List[Note])
async def get_similar_notes(note_id: str, current_user: User = Depends(get_current_user)):
    """
    Find most related/similar notes using graph traversal in Neo4j.
    Looks for notes within 2 hops (distance 1-2) from the start note.
    """
    database = db.get_db()
    # verify ownership
    await _get_user_note(database, note_id, current_user.id)
    
    driver = neo4j_db.get_driver()
    if not driver:
        return []
        
    query = """
    MATCH p = (n:Note {id: $note_id})-[*1..2]-(similar:Note)
    WHERE similar.id <> $note_id AND similar.owner_id = $owner_id
    WITH similar, min(length(p)) AS distance, count(p) AS paths
    ORDER BY paths DESC, distance ASC
    LIMIT 5
    RETURN similar.id as id
    """
    try:
        async with driver.session() as session:
            result = await session.run(query, note_id=note_id, owner_id=current_user.id)
            records = await result.data()
    except Exception as neo4j_err:
        print(f"[similar_notes] Neo4j unavailable: {neo4j_err}")
        return []
        
    similar_ids = [rec["id"] for rec in records]
    if not similar_ids:
        return []
        
    oids = []
    for sid in similar_ids:
        try:
            oids.append(ObjectId(sid))
        except Exception:
            pass
            
    notes_cursor = database["notes"].find({"_id": {"$in": oids}})
    notes_map = {str(n["_id"]): n async for n in notes_cursor}
    
    # Preserve Neo4j ordering (which is sorted by traversal strength)
    ordered_notes = []
    for sid in similar_ids:
        if sid in notes_map:
            doc = notes_map[sid]
            ordered_notes.append(await _populate_links(database, doc))
            
    return ordered_notes


@router.get("/{note_id}", response_model=Note)
async def read_note(note_id: str, current_user: User = Depends(get_current_user)):
    database = db.get_db()
    r = redis_client.get_redis()
    cache_key = f"note:{note_id}"
    recent_key = f"user:{current_user.id}:recent_notes"
    
    # Track recently viewed notes (push to list)
    await r.lrem(recent_key, 0, note_id)  # Remove if exists to push to front
    await r.lpush(recent_key, note_id)
    await r.ltrim(recent_key, 0, 19)      # Keep top 20
    
    # Attempt cache fetch
    cached_note = await r.get(cache_key)
    if cached_note:
        await log_activity(database, current_user.id, note_id, ActionType.view)
        data = json.loads(cached_note)
        return Note(**data)
        
    note_doc = await _get_user_note(database, note_id, current_user.id)
    populated = await _populate_links(database, note_doc)
    
    # Cache the result for 10 minutes (600 seconds)
    await r.setex(cache_key, 600, populated.model_dump_json(by_alias=True))
    
    await log_activity(database, current_user.id, note_id, ActionType.view)
    return populated


@router.post("/", response_model=Note)
async def create_note(note: NoteCreate, current_user: User = Depends(get_current_user)):
    database = db.get_db()
    note_data = note.model_dump()
    print(f"[DEBUG CREATE] Incoming note_data: {note_data}")
    note_data["owner_id"] = current_user.id
    note_data["created_at"] = datetime.now(timezone.utc)
    note_data["updated_at"] = datetime.now(timezone.utc)
    note_data.setdefault("linked_note_ids", [])
    note_data.setdefault("suggested_links", [])

    result = await database["notes"].insert_one(note_data)
    note_id_str = str(result.inserted_id)
    
    # Create Note in ElasticSearch
    es_client = elasticsearch_db.get_client()
    if es_client:
        es_doc = {
            "id": note_id_str,
            "owner_id": current_user.id,
            "title": note.title,
            "content": note.content,
            "tags": getattr(note, "tags", [])
        }
        try:
            await es_client.index(index="notes", id=note_id_str, document=es_doc)
        except Exception as e:
            print(f"ES index failed: {e}")
    
    # Create Note in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        query = """
        MERGE (n:Note {id: $note_id})
        SET n.title = $title, n.owner_id = $owner_id
        """
        try:
            async with driver.session() as session:
                await session.run(query, note_id=note_id_str, title=note.title, owner_id=current_user.id)
        except Exception as neo4j_err:
            print(f"[create_note] Neo4j unavailable: {neo4j_err}")
            
    await log_activity(database, current_user.id, note_id_str, ActionType.create)
    # Compute NLP suggestions after insert (fire-and-forget)
    await _compute_suggestions(database, note_id_str, current_user.id)
    created = await database["notes"].find_one({"_id": result.inserted_id})
    return await _populate_links(database, created)


@router.put("/{note_id}", response_model=Note)
async def update_note(
    note_id: str, note: NoteCreate, current_user: User = Depends(get_current_user)
):
    database = db.get_db()
    oid = _to_oid(note_id)
    await _get_user_note(database, note_id, current_user.id)  # ownership check

    update_data = note.model_dump(exclude_unset=True)
    print(f"[DEBUG UPDATE] Incoming update_data: {update_data}")
    update_data["updated_at"] = datetime.now(timezone.utc)

    await database["notes"].update_one({"_id": oid}, {"$set": update_data})
    await log_activity(database, current_user.id, note_id, ActionType.edit)
    # Recompute NLP suggestions after content changes
    await _compute_suggestions(database, note_id, current_user.id)
    updated = await database["notes"].find_one({"_id": oid})
    
    # Update Note in ElasticSearch
    es_client = elasticsearch_db.get_client()
    if es_client:
        es_doc = {
            "id": note_id,
            "owner_id": current_user.id,
            "title": note.title,
            "content": note.content,
            "tags": getattr(note, "tags", [])
        }
        try:
            await es_client.update(index="notes", id=note_id, doc=es_doc, doc_as_upsert=True)
        except Exception as e:
            print(f"ES update failed: {e}")
    
    # Update Note title in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        query = "MATCH (n:Note {id: $note_id}) SET n.title = $title"
        try:
            async with driver.session() as session:
                await session.run(query, note_id=note_id, title=note.title)
        except Exception as neo4j_err:
            print(f"[update_note] Neo4j unavailable: {neo4j_err}")
    
    # Invalidate caches
    r = redis_client.get_redis()
    await r.delete(f"note:{note_id}")
    await r.delete(f"user:{current_user.id}:recommendations")
    
    return await _populate_links(database, updated)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: str, current_user: User = Depends(get_current_user)):
    database = db.get_db()
    oid = _to_oid(note_id)
    await _get_user_note(database, note_id, current_user.id)  # ownership check

    # Remove this note's id from all other notes' linked_note_ids
    await database["notes"].update_many(
        {"linked_note_ids": note_id},
        {"$pull": {"linked_note_ids": note_id}},
    )

    await database["notes"].delete_one({"_id": oid})
    
    # Delete Note in ElasticSearch
    es_client = elasticsearch_db.get_client()
    if es_client:
        try:
            await es_client.delete(index="notes", id=note_id)
        except Exception as e:
            print(f"ES delete failed: {e}")
    
    # Detach Delete Note in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        query = "MATCH (n:Note {id: $note_id}) DETACH DELETE n"
        try:
            async with driver.session() as session:
                await session.run(query, note_id=note_id)
        except Exception as neo4j_err:
            print(f"[delete_note] Neo4j unavailable: {neo4j_err}")
    
    # Invalidate caches
    r = redis_client.get_redis()
    await r.delete(f"note:{note_id}")
    await r.delete(f"user:{current_user.id}:recommendations")
    
    return None


# ── linking endpoints ─────────────────────────────────────────────────────────

@router.post("/{note_id}/link", response_model=Note)
async def link_notes(
    note_id: str,
    body: LinkRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Bidirectionally link note_id ↔ target_note_id.
    Both notes must belong to the current user.
    """
    database = db.get_db()
    target_id = body.target_note_id

    if note_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot link a note to itself")

    # Verify ownership of both notes
    await _get_user_note(database, note_id, current_user.id)
    await _get_user_note(database, target_id, current_user.id)

    source_oid = _to_oid(note_id)
    target_oid = _to_oid(target_id)

    # $addToSet guarantees no duplicates
    await database["notes"].update_one(
        {"_id": source_oid},
        {"$addToSet": {"linked_note_ids": target_id}},
    )
    await database["notes"].update_one(
        {"_id": target_oid},
        {"$addToSet": {"linked_note_ids": note_id}},
    )

    updated = await database["notes"].find_one({"_id": source_oid})
    
    # Create bidirection relationship in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        # Enforce unidirection lexicographical edge to stop duplicate path blowups in Neo4j
        n_ids = sorted([note_id, target_id])
        query = """
        MATCH (a:Note {id: $n1})
        MATCH (b:Note {id: $n2})
        MERGE (a)-[:RELATED_TO]->(b)
        """
        try:
            async with driver.session() as session:
                await session.run(query, n1=n_ids[0], n2=n_ids[1])
        except Exception as neo4j_err:
            print(f"[link_notes] Neo4j unavailable: {neo4j_err}")
    
    # Invalidate caches for both notes and recommendations
    r = redis_client.get_redis()
    await r.delete(f"note:{note_id}", f"note:{target_id}", f"user:{current_user.id}:recommendations")
    
    return await _populate_links(database, updated)


@router.delete("/{note_id}/unlink", response_model=Note)
async def unlink_notes(
    note_id: str,
    body: LinkRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Bidirectionally remove the link between note_id ↔ target_note_id.
    Both notes must belong to the current user.
    """
    database = db.get_db()
    target_id = body.target_note_id

    # Verify ownership of both notes
    await _get_user_note(database, note_id, current_user.id)
    await _get_user_note(database, target_id, current_user.id)

    source_oid = _to_oid(note_id)
    target_oid = _to_oid(target_id)

    await database["notes"].update_one(
        {"_id": source_oid},
        {"$pull": {"linked_note_ids": target_id}},
    )
    await database["notes"].update_one(
        {"_id": target_oid},
        {"$pull": {"linked_note_ids": note_id}},
    )

    updated = await database["notes"].find_one({"_id": source_oid})
    
    # Delete relationship in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        n_ids = sorted([note_id, target_id])
        query = """
        MATCH (a:Note {id: $n1})-[r:RELATED_TO]-(b:Note {id: $n2})
        DELETE r
        """
        try:
            async with driver.session() as session:
                await session.run(query, n1=n_ids[0], n2=n_ids[1])
        except Exception as neo4j_err:
            print(f"[unlink_notes] Neo4j unavailable: {neo4j_err}")
    
    # Invalidate caches for both notes and recommendations
    r = redis_client.get_redis()
    await r.delete(f"note:{note_id}", f"note:{target_id}", f"user:{current_user.id}:recommendations")
    
    return await _populate_links(database, updated)
