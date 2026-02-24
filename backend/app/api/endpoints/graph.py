"""
GET /api/notes/graph
====================
Returns all of a user's notes as graph nodes and their manual links as edges.
Used by the Next.js knowledge-graph visualization.

Response shape:
{
  "nodes": [
    { "id": "...", "title": "...", "importance_score": 2.0, "memory_decay": 0.45 }
  ],
  "edges": [
    { "source": "note_id_a", "target": "note_id_b" }
  ]
}

Edges are deduplicated — if A→B and B→A both exist (bidirectional links),
only one edge is emitted to avoid doubling lines on the graph.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db
from bson import ObjectId


router = APIRouter()


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
    Build a graph of the user's notes where:
      - nodes = all notes (enriched with metrics if available)
      - edges = manual linked_note_ids relationships (deduplicated)
    """
    database = db.get_db()

    # Fetch all notes for this user
    notes = await database["notes"].find(
        {"owner_id": current_user.id},
        {"_id": 1, "title": 1, "linked_note_ids": 1},
    ).to_list(length=500)

    # Fetch cached metrics (may not exist for all notes)
    metrics_docs = await database["knowledge_metrics"].find(
        {"user_id": current_user.id},
    ).to_list(length=500)
    metrics_by_note = {m["note_id"]: m for m in metrics_docs}

    # Build node list
    note_ids = {str(n["_id"]) for n in notes}
    nodes: List[GraphNode] = []
    for note in notes:
        nid = str(note["_id"])
        m = metrics_by_note.get(nid, {})
        nodes.append(GraphNode(
            id=nid,
            title=note.get("title", "Untitled"),
            importance_score=m.get("importance_score", 0.0),
            memory_decay=m.get("memory_decay", 0.0),
            link_count=len(note.get("linked_note_ids", [])),
        ))

    # Build deduplicated edge list
    seen: set[frozenset] = set()
    edges: List[GraphEdge] = []
    for note in notes:
        src = str(note["_id"])
        for raw_target in note.get("linked_note_ids", []):
            tgt = str(raw_target)
            if tgt not in note_ids:
                continue  # skip orphaned links to deleted notes
            pair = frozenset((src, tgt))
            if pair not in seen:
                seen.add(pair)
                edges.append(GraphEdge(source=src, target=tgt))

    return GraphResponse(nodes=nodes, edges=edges)
