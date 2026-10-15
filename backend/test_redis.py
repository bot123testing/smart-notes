import asyncio
import httpx
import time
import uuid

async def main():
    base_url = "http://127.0.0.1:8000/api"
    # 1. Register and login
    unique = str(uuid.uuid4())[:8]
    email = f"test_{unique}@example.com"
    pw = "password123"
    
    async with httpx.AsyncClient() as client:
        # register
        await client.post(f"{base_url}/auth/register", json={"email": email, "password": pw})
        # login
        resp = await client.post(f"{base_url}/auth/login", data={"username": email, "password": pw})
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # create note 1
        resp = await client.post(f"{base_url}/notes/", json={"title": "Note 1", "content": "Content 1"}, headers=headers)
        note1_id = resp.json()["id"]
        
        # create note 2
        resp = await client.post(f"{base_url}/notes/", json={"title": "Note 2", "content": "Content 2"}, headers=headers)
        note2_id = resp.json()["id"]
        
        # fetch note 1 (cache miss, sets cache, adds to recent)
        t0 = time.time()
        resp = await client.get(f"{base_url}/notes/{note1_id}", headers=headers)
        print(f"Fetch 1: {time.time() - t0:.4f}s")
        assert resp.json()["title"] == "Note 1"
        
        # fetch note 1 again (cache hit)
        t0 = time.time()
        resp = await client.get(f"{base_url}/notes/{note1_id}", headers=headers)
        print(f"Fetch 2 (Cache Hit): {time.time() - t0:.4f}s")
        
        # fetch note 2 (cache miss, sets cache, adds to recent)
        await client.get(f"{base_url}/notes/{note2_id}", headers=headers)
        
        # get recent notes
        resp = await client.get(f"{base_url}/notes/recent", headers=headers)
        recent = resp.json()
        print(f"Recent notes count: {len(recent)}")
        assert recent[0]["id"] == note2_id
        assert recent[1]["id"] == note1_id
        print("Recent notes logic is correct.")
        
        # update note 1 (invalidates cache)
        await client.put(f"{base_url}/notes/{note1_id}", json={"title": "Note 1 Updated", "content": "Content 1"}, headers=headers)
        
        # fetch note 1 (should be cache miss since it was invalidated)
        resp = await client.get(f"{base_url}/notes/{note1_id}", headers=headers)
        assert resp.json()["title"] == "Note 1 Updated"
        print("Update cache invalidation logic is correct.")
        
        print("ALL TESTS PASSED")

asyncio.run(main())
