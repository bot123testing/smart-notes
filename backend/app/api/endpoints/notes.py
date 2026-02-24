from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List
from app.models.note import Note, NoteCreate, LinkedNoteMeta, SuggestedLink
from app.models.metrics import RecommendationsResponse
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db
from app.api.activity_logger import log_activity
from app.models.activity import ActionType
from app.services.metrics_service import compute_and_store_metrics
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
    Compute knowledge metrics for all user notes and return them sorted by
    memory_decay (highest first) — i.e., notes most in need of review appear first.
    """
    database = db.get_db()
    return await compute_and_store_metrics(database, current_user.id)


# ── Graph response models ─────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    title: str
    importance_score: float = 0.0
    memory_decay: float = 0.0
    link_count: int = 0

class GraphEdge(BaseModel):
    source: str
    target: str

class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


@router.get("/graph", response_model=GraphResponse)
async def get_notes_graph(current_user: User = Depends(get_current_user)):
    """
    Return all user notes as graph nodes plus their manual links as edges.
    Edges are deduplicated (bidirectional links produce one edge).
    Nodes are enriched with importance_score and memory_decay from knowledge_metrics.
    """
    database = db.get_db()

    notes = await database["notes"].find(
        {"owner_id": current_user.id},
        {"_id": 1, "title": 1, "linked_note_ids": 1},
    ).to_list(length=500)

    metrics_docs = await database["knowledge_metrics"].find(
        {"user_id": current_user.id},
    ).to_list(length=500)
    metrics_by_note = {m["note_id"]: m for m in metrics_docs}

    note_ids = {str(n["_id"]) for n in notes}
    graph_nodes: List[GraphNode] = []
    for note in notes:
        nid = str(note["_id"])
        m = metrics_by_note.get(nid, {})
        graph_nodes.append(GraphNode(
            id=nid,
            title=note.get("title", "Untitled"),
            importance_score=round(float(m.get("importance_score", 0.0)), 4),
            memory_decay=round(float(m.get("memory_decay", 0.0)), 4),
            link_count=len(note.get("linked_note_ids", [])),
        ))

    seen: set = set()
    graph_edges: List[GraphEdge] = []
    for note in notes:
        src = str(note["_id"])
        for raw_target in note.get("linked_note_ids", []):
            tgt = str(raw_target)
            if tgt not in note_ids:
                continue
            pair = frozenset((src, tgt))
            if pair not in seen:
                seen.add(pair)
                graph_edges.append(GraphEdge(source=src, target=tgt))

    return GraphResponse(nodes=graph_nodes, edges=graph_edges)


@router.get("/", response_model=List[Note])
async def read_notes(current_user: User = Depends(get_current_user)):
    database = db.get_db()
    notes = await database["notes"].find({"owner_id": current_user.id}).to_list(length=100)
    # Log a view event for each note returned in the list
    for note in notes:
        await log_activity(database, current_user.id, str(note["_id"]), ActionType.view)
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


@router.get("/{note_id}", response_model=Note)
async def read_note(note_id: str, current_user: User = Depends(get_current_user)):
    database = db.get_db()
    note_doc = await _get_user_note(database, note_id, current_user.id)
    await log_activity(database, current_user.id, note_id, ActionType.view)
    return await _populate_links(database, note_doc)


@router.post("/", response_model=Note)
async def create_note(note: NoteCreate, current_user: User = Depends(get_current_user)):
    database = db.get_db()
    note_data = note.model_dump()
    note_data["owner_id"] = current_user.id
    note_data["created_at"] = datetime.now(timezone.utc)
    note_data["updated_at"] = datetime.now(timezone.utc)
    note_data.setdefault("linked_note_ids", [])
    note_data.setdefault("suggested_links", [])

    result = await database["notes"].insert_one(note_data)
    note_id_str = str(result.inserted_id)
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
    update_data["updated_at"] = datetime.now(timezone.utc)

    await database["notes"].update_one({"_id": oid}, {"$set": update_data})
    await log_activity(database, current_user.id, note_id, ActionType.edit)
    # Recompute NLP suggestions after content changes
    await _compute_suggestions(database, note_id, current_user.id)
    updated = await database["notes"].find_one({"_id": oid})
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
    return await _populate_links(database, updated)
