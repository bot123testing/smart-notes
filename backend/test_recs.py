import asyncio
import httpx
import uuid
from app.db.mongodb import db
from app.services.metrics_service import compute_and_store_metrics

async def main():
    base_url = "http://127.0.0.1:8000/api"
    unique = str(uuid.uuid4())[:8]
    email = f"test_recs_{unique}@example.com"
    pw = "password123"
    
    async with httpx.AsyncClient() as client:
        # Register and login
        await client.post(f"{base_url}/auth/register", json={"email": email, "password": pw})
        resp = await client.post(f"{base_url}/auth/login", data={"username": email, "password": pw})
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 1. Create a cluster of 4 related notes
        r1 = await client.post(f"{base_url}/notes/", json={"title": "Dog Training", "content": "Basic commands"}, headers=headers)
        n1 = r1.json()["id"]
        
        r2 = await client.post(f"{base_url}/notes/", json={"title": "Dog Diet", "content": "Healthy food"}, headers=headers)
        n2 = r2.json()["id"]
        
        r3 = await client.post(f"{base_url}/notes/", json={"title": "Dog Walker", "content": "Schedule walks"}, headers=headers)
        n3 = r3.json()["id"]
        
        r4 = await client.post(f"{base_url}/notes/", json={"title": "Random Idea", "content": "A completely unrelated note"}, headers=headers)
        n4 = r4.json()["id"]
        
        # Link the dog notes together in a graph
        await client.post(f"{base_url}/notes/{n1}/link", json={"target_note_id": n2}, headers=headers)
        await client.post(f"{base_url}/notes/{n2}/link", json={"target_note_id": n3}, headers=headers)
        
        # 2. Simulate reading notes N1 and N2 (Pushes to Redis Context)
        await client.get(f"{base_url}/notes/{n1}", headers=headers)
        await client.get(f"{base_url}/notes/{n2}", headers=headers)
        
        # 3. Trigger raw metric computation offline so mongodb has memory decay data
        await db.connect()
        database = db.get_db()
        await compute_and_store_metrics(database, r1.json()["owner_id"])
        
        # Give DB indexing a second just in case
        await asyncio.sleep(1)

        # 4. Request hybrid recommendations
        resp_recs = await client.get(f"{base_url}/notes/recommendations", headers=headers)
        print(resp_recs.text)
        recs = resp_recs.json().get("notes", [])
        
        print("\n=== HYBRID RECOMMENDATIONS ===")
        for i, r in enumerate(recs):
            print(f"{i+1}. {r['title']} (memory_decay: {r['memory_decay']}, importance: {r['importance_score']})")
            
        assert len(recs) <= 4

if __name__ == "__main__":
    asyncio.run(main())
