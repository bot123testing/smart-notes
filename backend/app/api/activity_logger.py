"""
Lightweight helper — fire-and-forget activity logging.
Import and call `log_activity(database, user_id, note_id, action_type)` from any endpoint.
"""
from datetime import datetime, timezone
from app.models.activity import ActionType


async def log_activity(database, user_id: str, note_id: str, action_type: ActionType) -> None:
    """
    Insert a single activity event into user_activity.
    Intentionally does NOT raise — logging failures must never break the main request.
    """
    try:
        await database["user_activity"].insert_one({
            "user_id": user_id,
            "note_id": note_id,
            "action_type": action_type.value,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception as e:
        # Log silently — never propagate
        print(f"[activity] Failed to log {action_type} for note {note_id}: {e}")
