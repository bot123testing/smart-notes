import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["smartnotes"]
    
    # Just grab ANY user that has activity
    activity = await db["user_activity"].find_one()
    if not activity:
        print("No activity found to test with.")
        return
        
    user_id = activity["user_id"]
    
    # Insert mock link/unlink events
    events = [
        {"user_id": user_id, "note_id": "test_note_1", "action_type": "link", "timestamp": "2024-01-01T12:00:00Z"},
        {"user_id": user_id, "note_id": "test_note_1", "action_type": "link", "timestamp": "2024-01-02T12:00:00Z"},
        {"user_id": user_id, "note_id": "test_note_1", "action_type": "unlink", "timestamp": "2024-01-03T12:00:00Z"},
        {"user_id": user_id, "note_id": "test_note_2", "action_type": "delete", "timestamp": "2024-01-04T12:00:00Z"},
        {"user_id": user_id, "note_id": "test_note_2", "action_type": "edit", "timestamp": "2024-01-05T12:00:00Z"},
    ]
    await db["user_activity"].insert_many(events)
    
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": {"note_id": "$note_id", "action_type": "$action_type"},
            "count": {"$sum": 1},
            "last_ts": {"$max": "$timestamp"},
        }},
        {"$group": {
            "_id": "$_id.note_id",
            "view_count":   {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "view"]},   "$count", 0]}},
            "edit_count":   {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "edit"]},   "$count", 0]}},
            "create_count": {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "create"]}, "$count", 0]}},
            "delete_count": {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "delete"]}, "$count", 0]}},
            "link_count":   {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "link"]},   "$count", 0]}},
            "unlink_count": {"$sum": {"$cond": [{"$eq": ["$_id.action_type", "unlink"]}, "$count", 0]}},
            "last_accessed": {"$max": "$last_ts"},
        }},
        {"$sort": {"last_accessed": -1}},
    ]
    stats = await db["user_activity"].aggregate(pipeline).to_list(10)
    for s in stats:
        if s["_id"] in ["test_note_1", "test_note_2"]:
            print(s)
            
    # Cleanup mock events
    await db["user_activity"].delete_many({"note_id": {"$in": ["test_note_1", "test_note_2"]}})

if __name__ == "__main__":
    asyncio.run(test())
