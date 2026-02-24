from fastapi import APIRouter, Depends
from app.models.activity import ActivityStatsResponse, NoteActivityStats, TimelineResponse, TimelineDataPoint
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db
from datetime import datetime

router = APIRouter()


@router.get("/stats", response_model=ActivityStatsResponse)
async def get_activity_stats(current_user: User = Depends(get_current_user)):
    """
    Return per-note activity counts for the authenticated user.

    Uses two aggregation stages:
      1. $group by note_id + action_type → count each action per note
      2. $group by note_id → pivot action counts into a single document
    Then enriches each note with its title from the notes collection.
    """
    database = db.get_db()

    pipeline = [
        # Only this user's events
        {"$match": {"user_id": current_user.id}},

        # Stage 1: count per (note_id, action_type)
        {"$group": {
            "_id": {"note_id": "$note_id", "action_type": "$action_type"},
            "count": {"$sum": 1},
            "last_ts": {"$max": "$timestamp"},
        }},

        # Stage 2: pivot into one doc per note
        {"$group": {
            "_id": "$_id.note_id",
            "view_count":   {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "view"]},   "$count", 0]}},
            "edit_count":   {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "edit"]},   "$count", 0]}},
            "create_count": {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "create"]}, "$count", 0]}},
            "delete_count": {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "delete"]}, "$count", 0]}},
            "last_accessed": {"$max": "$last_ts"},
        }},

        # Sort most-recently-accessed first
        {"$sort": {"last_accessed": -1}},
    ]

    raw_stats = await database["user_activity"].aggregate(pipeline).to_list(length=500)

    # Batch-fetch note titles in one query
    note_ids = [s["_id"] for s in raw_stats]
    from bson import ObjectId
    oids = []
    for nid in note_ids:
        try:
            oids.append(ObjectId(nid))
        except Exception:
            pass

    title_map: dict[str, str] = {}
    if oids:
        async for doc in database["notes"].find({"_id": {"$in": oids}}, {"_id": 1, "title": 1}):
            title_map[str(doc["_id"])] = doc["title"]

    # Build response
    note_stats = []
    total_events = 0
    for s in raw_stats:
        note_id = s["_id"]
        counts = {
            "view_count":   s.get("view_count", 0),
            "edit_count":   s.get("edit_count", 0),
            "create_count": s.get("create_count", 0),
            "delete_count": s.get("delete_count", 0),
        }
        total = sum(counts.values())
        total_events += total

        # Parse timestamp to datetime if it's a string
        last_ts = s.get("last_accessed")
        if isinstance(last_ts, str):
            try:
                last_ts = datetime.fromisoformat(last_ts)
            except Exception:
                last_ts = None

        note_stats.append(NoteActivityStats(
            note_id=note_id,
            note_title=title_map.get(note_id, "(deleted note)"),
            last_accessed=last_ts,
            total=total,
            **counts,
        ))

    return ActivityStatsResponse(total_events=total_events, notes=note_stats)


@router.get("/timeline", response_model=TimelineResponse)
async def get_activity_timeline(current_user: User = Depends(get_current_user)):
    """
    Return cumulative note creations over time for the authenticated user.
    Groups 'create' events by YYYY-MM-DD to build a growth curve.
    """
    database = db.get_db()

    pipeline = [
        # Match only 'create' events for this user
        {"$match": {
            "user_id": current_user.id,
            "action_type": "create"
        }},
        # Extract YYYY-MM-DD from the timestamp
        {"$project": {
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}
        }},
        # Group by date and count
        {"$group": {
            "_id": "$date",
            "count": {"$sum": 1}
        }},
        # Sort chronologically
        {"$sort": {"_id": 1}}
    ]

    daily_counts = await database["user_activity"].aggregate(pipeline).to_list(length=500)

    timeline_data = []
    cumulative = 0
    for day in daily_counts:
        cumulative += day["count"]
        timeline_data.append(TimelineDataPoint(
            date=day["_id"],
            count=cumulative
        ))

    return TimelineResponse(timeline=timeline_data)
