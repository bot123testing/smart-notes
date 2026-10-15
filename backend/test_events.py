import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["smartnotes"]
    events = await db["user_activity"].find({}, sort=[("timestamp", -1)]).to_list(10)
    for e in events:
        print(f"{e['timestamp']} | {e.get('action_type')} | {e.get('note_id')}")

if __name__ == "__main__":
    asyncio.run(test())
