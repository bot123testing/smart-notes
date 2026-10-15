import asyncio
from app.db.mongodb import db
from app.services.metrics_service import compute_and_store_metrics

async def main():
    await db.connect()
    database = db.get_db()
    
    # Get a user who has notes
    user = await database["users"].find_one({})
    if not user:
        print("No users found.")
        return
        
    print(f"Running metrics computation for user {user['email']} (ID {user['_id']})")
    res = await compute_and_store_metrics(database, str(user["_id"]))
    print(f"Computed metrics for {res.total} notes.")
    
    await db.disconnect()

asyncio.run(main())
