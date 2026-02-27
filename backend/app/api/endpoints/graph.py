"""
GET /api/notes/graph
====================
Returns all of a user's notes as graph nodes and their manual links as edges.
Used by the React Native knowledge-graph visualization.

Response shape:
{
  "nodes": [
    { "id": "...", "title": "...", "importance_score": 2.0, "memory_decay": 0.45, "link_count": 3 }
  ],
  "edges": [
    { "source": "note_id_a", "target": "note_id_b" }
  ]
}

Edges are deduplicated — if A→B and B→A both exist (bidirectional links),
only one edge is emitted to avoid doubling lines on the graph.

Data source: MongoDB (linked_note_ids on each note document).
Metrics (importance_score, memory_decay) are enriched from knowledge_metrics collection.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db


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
    Build a knowledge graph of the user's notes from MongoDB:
      - nodes = all notes, enriched with importance_score and memory_decay
      - edges = manual linked_note_ids relationships (bidirectionally deduplicated)
    """
    database = db.get_db()

    # 1. Fetch all user notes with only the fields we need
    notes = await database["notes"].find(
        {"owner_id": current_user.id},
        {"_id": 1, "title": 1, "linked_note_ids": 1},
    ).to_list(length=1000)

    # 2. Fetch metrics for enrichment
    metrics_docs = await database["knowledge_metrics"].find(
        {"user_id": current_user.id},
    ).to_list(length=1000)
    metrics_by_note = {m["note_id"]: m for m in metrics_docs}

    # 3. Build the set of all valid note IDs (as strings, regardless of how stored)
    note_ids = {str(n["_id"]) for n in notes}

    # 4. Build nodes
    graph_nodes: List[GraphNode] = []
    for note in notes:
        nid = str(note["_id"])
        m = metrics_by_note.get(nid, {})
        # linked_note_ids may be ObjectId or string — normalise to strings
        raw_links = note.get("linked_note_ids", [])
        link_count = sum(1 for lid in raw_links if str(lid) in note_ids)
        graph_nodes.append(GraphNode(
            id=nid,
            title=note.get("title", "Untitled"),
            importance_score=round(float(m.get("importance_score", 0.0)), 4),
            memory_decay=round(float(m.get("memory_decay", 0.0)), 4),
            link_count=link_count,
        ))

    # 5. Build edges (deduplicated bidirectional pairs)
    seen: set = set()
    graph_edges: List[GraphEdge] = []
    for note in notes:
        src = str(note["_id"])
        for raw_target in note.get("linked_note_ids", []):
            tgt = str(raw_target)
            if tgt not in note_ids:
                continue  # skip links to deleted/foreign notes
            pair = frozenset((src, tgt))
            if pair not in seen:
                seen.add(pair)
                graph_edges.append(GraphEdge(source=src, target=tgt))

    return GraphResponse(nodes=graph_nodes, edges=graph_edges)
