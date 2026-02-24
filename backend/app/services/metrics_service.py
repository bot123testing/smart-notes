"""
Knowledge Metrics Service
=========================
Computes and persists knowledge metrics for all of a user's notes.

Formulas
--------
  importance_score = (edit_count * 2) + link_count
      - Edit events weighted 2× because editing signals deep engagement.
      - link_count from the note's linked_note_ids array.

  memory_decay = 1 - exp(-λ * days_since_last_access)
      - Inspired by the Ebbinghaus forgetting curve.
      - λ = 0.1  →  decay profile:
            0 days  → 0.00  (just accessed)
            7 days  → 0.50  (half-forgotten)
           23 days  → 0.90  (heavily decayed)
           46 days  → 0.99  (nearly max)
      - Notes never accessed: treated as 30 days old (max decay ≈ 0.95).

Results are upserted into knowledge_metrics (one doc per user+note) so the
collection can be queried later or audited over time.
"""
import math
from datetime import datetime, timezone
from typing import Any

from app.models.metrics import KnowledgeMetric, NoteRecommendation, RecommendationsResponse

_DECAY_LAMBDA = 0.1
_FALLBACK_DAYS = 30   # days assumed if a note was never accessed


def _compute_decay(last_accessed: datetime | None) -> float:
    if last_accessed is None:
        days = _FALLBACK_DAYS
    else:
        # Ensure tz-aware comparison
        now = datetime.now(timezone.utc)
        if last_accessed.tzinfo is None:
            last_accessed = last_accessed.replace(tzinfo=timezone.utc)
        days = max((now - last_accessed).total_seconds() / 86400, 0)
    return round(1 - math.exp(-_DECAY_LAMBDA * days), 4)


async def compute_and_store_metrics(
    database, user_id: str
) -> RecommendationsResponse:
    """
    1. Pull activity counts from user_activity via aggregation.
    2. Pull notes (for link_count + titles).
    3. Compute importance_score and memory_decay per note.
    4. Upsert into knowledge_metrics.
    5. Return sorted RecommendationsResponse (highest decay first).
    """
    now = datetime.now(timezone.utc)

    # ── 1. Aggregate activity counts per note ──────────────────────────────
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$note_id",
            "edit_count":   {"$sum": {"$cond": [{"$eq": ["$action_type", "edit"]},   1, 0]}},
            "access_count": {"$sum": 1},
            "last_accessed": {"$max": "$timestamp"},
        }},
    ]
    activity_docs: list[dict[str, Any]] = await database["user_activity"].aggregate(pipeline).to_list(length=1000)
    activity_by_note = {doc["_id"]: doc for doc in activity_docs}

    # ── 2. Fetch all user notes ────────────────────────────────────────────
    notes = await database["notes"].find({"owner_id": user_id}).to_list(length=500)

    # ── 3 & 4. Compute + upsert ────────────────────────────────────────────
    recommendations: list[NoteRecommendation] = []

    for note in notes:
        note_id = str(note["_id"])
        act = activity_by_note.get(note_id, {})

        edit_count = act.get("edit_count", 0)
        access_count = act.get("access_count", 0)
        last_accessed = act.get("last_accessed")  # datetime or None

        # Normalise to tz-aware datetime
        if isinstance(last_accessed, datetime) and last_accessed.tzinfo is None:
            last_accessed = last_accessed.replace(tzinfo=timezone.utc)

        link_count = len(note.get("linked_note_ids", []))
        importance_score = round(edit_count * 2 + link_count, 4)
        memory_decay = _compute_decay(last_accessed)

        # Upsert into knowledge_metrics
        metric_doc = {
            "note_id": note_id,
            "user_id": user_id,
            "importance_score": importance_score,
            "access_count": access_count,
            "last_accessed": last_accessed,
            "memory_decay": memory_decay,
            "computed_at": now,
        }
        await database["knowledge_metrics"].update_one(
            {"note_id": note_id, "user_id": user_id},
            {"$set": metric_doc},
            upsert=True,
        )

        recommendations.append(NoteRecommendation(
            note_id=note_id,
            title=note.get("title", ""),
            importance_score=importance_score,
            access_count=access_count,
            last_accessed=last_accessed,
            memory_decay=memory_decay,
            linked_note_count=link_count,
        ))

    # Sort by highest decay (needs review first), then lowest importance (least engaged)
    recommendations.sort(key=lambda r: (-r.memory_decay, r.importance_score))

    return RecommendationsResponse(notes=recommendations, total=len(recommendations))
