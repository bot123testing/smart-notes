import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def test():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["smartnotes"]
    notes = await db["notes"].find().sort("_id", -1).limit(5).to_list(5)
    for n in notes:
        print(f"Title: {n.get('title')} | Tags: {n.get('tags')}")

asyncio.run(test())
