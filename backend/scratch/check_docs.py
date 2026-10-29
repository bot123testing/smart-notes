import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.mongodb import db

async def main():
    await db.connect()
    database = db.get_db()
    docs = await database["documents"].find().to_list(length=20)
    print(f"Total documents in MongoDB: {len(docs)}")
    for d in docs:
        print(f"  ID: {d['_id']} | File: {d.get('filename')} | Owner: {d.get('owner_id')} | Status: {d.get('status')}")

if __name__ == "__main__":
    asyncio.run(main())
