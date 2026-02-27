import asyncio
import httpx
import time
import uuid

async def main():
    base_url = "http://127.0.0.1:8000/api"
    # 1. Register and login
    unique = str(uuid.uuid4())[:8]
    email = f"test_neo4j_{unique}@example.com"
    pw = "password123"
    
    async with httpx.AsyncClient() as client:
        # register (creates :User node)
        await client.post(f"{base_url}/auth/register", json={"email": email, "password": pw})
        # login
        resp = await client.post(f"{base_url}/auth/login", data={"username": email, "password": pw})
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # create notes (creates :Note nodes)
        resp1 = await client.post(f"{base_url}/notes/", json={"title": "Neo Note 1", "content": "Content 1"}, headers=headers)
        n1 = resp1.json()["id"]
        
        resp2 = await client.post(f"{base_url}/notes/", json={"title": "Neo Note 2", "content": "Content 2"}, headers=headers)
        n2 = resp2.json()["id"]
        
        resp3 = await client.post(f"{base_url}/notes/", json={"title": "Neo Note 3", "content": "Content 3"}, headers=headers)
        n3 = resp3.json()["id"]
        
        # link n1 <-> n2, n2 <-> n3 (creates [:RELATED_TO] edges)
        await client.post(f"{base_url}/notes/{n1}/link", json={"target_note_id": n2}, headers=headers)
        await client.post(f"{base_url}/notes/{n2}/link", json={"target_note_id": n3}, headers=headers)
        
        # test /graph
        resp_graph = await client.get(f"{base_url}/notes/graph", headers=headers)
        graph = resp_graph.json()
        print(f"Graph Nodes: {len(graph['nodes'])} (Expected 3)")
        print(f"Graph Edges: {len(graph['edges'])} (Expected 2)")
        
        assert len(graph['nodes']) == 3
        # Edges should be exactly 2 because we deduplicate a<->b
        assert len(graph['edges']) == 2
        
        # test /similar/{id}
        # similar to n1 should be n2 (distance 1) and n3 (distance 2)
        resp_sim = await client.get(f"{base_url}/notes/similar/{n1}", headers=headers)
        similar = resp_sim.json()
        print(f"Similar to Note 1: {len(similar)}")
        for i, s in enumerate(similar):
            print(f"  {i+1}: {s['title']}")
        
        assert len(similar) == 2
        assert similar[0]["id"] == n2 # Distance 1, strength 1
        assert similar[1]["id"] == n3 # Distance 2, strength 1
        
        print("ALL TESTS PASSED")

asyncio.run(main())
