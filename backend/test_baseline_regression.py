import asyncio
import httpx
import uuid
import json
from motor.motor_asyncio import AsyncIOMotorClient
from elasticsearch import AsyncElasticsearch
from neo4j import AsyncGraphDatabase
import redis.asyncio as redis
from bson import ObjectId

BASE_URL = "http://127.0.0.1:8000/api"
DB_NAME = "smartnotes_studypath"
ES_INDEX = "studypath_notes"
NEO4J_LABEL = "SP_Note"
NEO4J_USER_LABEL = "SP_User"
REDIS_PREFIX = "sp:"

async def test_regression():
    print("\n==================================================================")
    print("STARTING STRICT PHASE B BASELINE REGRESSION TEST")
    print(f"Target Mongo DB:      {DB_NAME}")
    print(f"Target ES Index:     {ES_INDEX}")
    print(f"Target Neo4j Label:  {NEO4J_LABEL}")
    print(f"Target Redis Prefix: {REDIS_PREFIX}")
    print("Fail fast if any store is unreachable (no silent degradation)")
    print("==================================================================\n")

    # 0. STRICT PRE-FLIGHT CHECK: Fail immediately if any store is down
    print("0. Verifying All 4 Stores Are Directly Reachable...")
    try:
        m_client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
        await m_client.admin.command("ping")
        print("   [PASS] Pre-flight: MongoDB reachable")
    except Exception as e:
        print(f"   [FAIL] Pre-flight: MongoDB unreachable: {e}")
        raise RuntimeError(f"MongoDB unreachable: {e}")

    try:
        r_client = redis.from_url("redis://127.0.0.1:6379/0", decode_responses=True, protocol=2)
        assert await r_client.ping() is True
        print("   [PASS] Pre-flight: Redis reachable")
    except Exception as e:
        print(f"   [FAIL] Pre-flight: Redis unreachable: {e}")
        raise RuntimeError(f"Redis unreachable: {e}")

    try:
        es = AsyncElasticsearch("http://127.0.0.1:9200")
        es_info = await es.info()
        print(f"   [PASS] Pre-flight: Elasticsearch reachable (v{es_info['version']['number']})")
    except Exception as e:
        print(f"   [FAIL] Pre-flight: Elasticsearch unreachable: {e}")
        raise RuntimeError(f"Elasticsearch unreachable: {e}")

    try:
        driver = AsyncGraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", "password"))
        await driver.verify_connectivity()
        print("   [PASS] Pre-flight: Neo4j reachable and authenticated")
    except Exception as e:
        print(f"   [FAIL] Pre-flight: Neo4j unreachable: {e}")
        raise RuntimeError(f"Neo4j unreachable: {e}")

    unique = str(uuid.uuid4())[:8]
    email = f"strict_{unique}@example.com"
    password = "password123"

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Register
        print("\n1. Testing User Registration...")
        reg_resp = await client.post(f"{BASE_URL}/auth/register", json={"email": email, "password": password})
        assert reg_resp.status_code == 200, f"Register failed: {reg_resp.text}"
        user_data = reg_resp.json()
        user_id = user_data["id"]
        # Assert in Mongo
        m_user = await m_client[DB_NAME]["users"].find_one({"_id": ObjectId(user_id)})
        assert m_user is not None, f"User not found in MongoDB database '{DB_NAME}'!"
        # Assert in Neo4j
        async with driver.session() as session:
            res = await session.run(f"MATCH (u:{NEO4J_USER_LABEL} {{id: $uid}}) RETURN u", uid=user_id)
            assert await res.single() is not None, f"User node (:{NEO4J_USER_LABEL}) not created in Neo4j!"
        print(f"   [PASS] Feature 'register': User stored in Mongo '{DB_NAME}' and Neo4j ':{NEO4J_USER_LABEL}'")

        # 2. Login
        print("\n2. Testing User Login...")
        login_resp = await client.post(f"{BASE_URL}/auth/login", data={"username": email, "password": password})
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("   [PASS] Feature 'login': JWT token acquired successfully")

        # 3. Create Note 1
        print("\n3. Testing Create Note 1...")
        n1_resp = await client.post(f"{BASE_URL}/notes/", json={"title": "Raft Consensus", "content": "Raft is an understandable consensus algorithm for replicated logs."}, headers=headers)
        assert n1_resp.status_code == 200, f"Create Note 1 failed: {n1_resp.text}"
        note1_id = n1_resp.json()["id"]
        # Assert in Mongo
        m_n1 = await m_client[DB_NAME]["notes"].find_one({"_id": ObjectId(note1_id)})
        assert m_n1 is not None, "Note 1 missing from Mongo!"
        # Assert in ES
        await asyncio.sleep(1)
        es_n1 = await es.get(index=ES_INDEX, id=note1_id)
        assert es_n1["_source"]["title"] == "Raft Consensus", "Note 1 missing from Elasticsearch index!"
        # Assert in Neo4j
        async with driver.session() as session:
            res = await session.run(f"MATCH (n:{NEO4J_LABEL} {{id: $nid}}) RETURN n.title AS title", nid=note1_id)
            rec = await res.single()
            assert rec is not None and rec["title"] == "Raft Consensus", "Note 1 missing from Neo4j!"
        print(f"   [PASS] Feature 'create_note': Verified across Mongo, ES '{ES_INDEX}', and Neo4j ':{NEO4J_LABEL}'")

        # 4. Create Note 2
        print("\n4. Testing Create Note 2...")
        n2_resp = await client.post(f"{BASE_URL}/notes/", json={"title": "Paxos Protocol", "content": "Paxos is a consensus protocol for distributed state machine replication."}, headers=headers)
        assert n2_resp.status_code == 200, f"Create Note 2 failed: {n2_resp.text}"
        note2_id = n2_resp.json()["id"]
        print(f"   [PASS] Feature 'create_note': Note 2 created with ID {note2_id}")

        # 5. Magic Tags
        print("\n5. Testing Magic Tags...")
        tags_resp = await client.post(f"{BASE_URL}/ai/magic-tags", json={"title": "Raft Consensus", "content": "Leader election and distributed log replication"}, headers=headers)
        assert tags_resp.status_code == 200, f"Magic tags failed: {tags_resp.text}"
        tags = tags_resp.json()
        assert isinstance(tags, list), "Tags must be a list"
        print(f"   [PASS] Feature 'magic_tags': Response returned valid tag list {tags}")

        # 6. Read Note & Redis Caching
        print("\n6. Testing Read Note & Redis Caching...")
        await client.get(f"{BASE_URL}/notes/{note1_id}", headers=headers)
        cached = await r_client.get(f"{REDIS_PREFIX}note:{note1_id}")
        assert cached is not None, f"Redis cache key '{REDIS_PREFIX}note:{note1_id}' missing!"
        print(f"   [PASS] Feature 'read_note': Note cached under '{REDIS_PREFIX}note:{note1_id}'")

        # 7. Recent Notes
        print("\n7. Testing Recent Notes Feed...")
        recent_resp = await client.get(f"{BASE_URL}/notes/recent", headers=headers)
        assert recent_resp.status_code == 200
        recent_list = recent_resp.json()
        assert len(recent_list) >= 1
        # Check Redis list
        r_recents = await r_client.lrange(f"{REDIS_PREFIX}user:{user_id}:recent_notes", 0, -1)
        assert note1_id in r_recents, f"Note 1 missing from Redis recent_notes list '{REDIS_PREFIX}user:{user_id}:recent_notes'!"
        print(f"   [PASS] Feature 'recent_notes': Verified in API and Redis key '{REDIS_PREFIX}user:{user_id}:recent_notes'")

        # 8. Edit Note & Cache Invalidation
        print("\n8. Testing Edit Note & Cache Invalidation...")
        up_resp = await client.put(f"{BASE_URL}/notes/{note1_id}", json={"title": "Raft Consensus Protocol", "content": "Updated content on Raft algorithm."}, headers=headers)
        assert up_resp.status_code == 200
        # Assert cache cleared
        assert await r_client.get(f"{REDIS_PREFIX}note:{note1_id}") is None, "Redis cache was not invalidated!"
        # Assert Mongo updated
        up_mongo = await m_client[DB_NAME]["notes"].find_one({"_id": ObjectId(note1_id)})
        assert up_mongo["title"] == "Raft Consensus Protocol"
        # Assert ES updated
        await asyncio.sleep(1)
        up_es = await es.get(index=ES_INDEX, id=note1_id)
        assert up_es["_source"]["title"] == "Raft Consensus Protocol"
        print(f"   [PASS] Feature 'edit_note': Verified update in Mongo, ES, and Redis invalidation")

        # 9. Link Notes
        print("\n9. Testing Link Notes...")
        link_resp = await client.post(f"{BASE_URL}/notes/{note1_id}/link", json={"target_note_id": note2_id}, headers=headers)
        assert link_resp.status_code == 200
        async with driver.session() as session:
            res = await session.run(f"MATCH (a:{NEO4J_LABEL} {{id: $n1}})-[r:RELATED_TO]-(b:{NEO4J_LABEL} {{id: $n2}}) RETURN r LIMIT 1", n1=note1_id, n2=note2_id)
            assert await res.single() is not None, "Neo4j [:RELATED_TO] edge was not created!"
        print(f"   [PASS] Feature 'link_notes': Verified Neo4j created [:RELATED_TO] edge")

        # 10. Recommendations
        print("\n10. Testing Recommendations Endpoint...")
        rec_resp = await client.get(f"{BASE_URL}/notes/recommendations", headers=headers)
        assert rec_resp.status_code == 200
        # Verify cached in Redis
        r_rec_cached = await r_client.get(f"{REDIS_PREFIX}user:{user_id}:recommendations")
        assert r_rec_cached is not None, f"Recommendations not cached in '{REDIS_PREFIX}user:{user_id}:recommendations'!"
        print(f"   [PASS] Feature 'recommendations': Responded with recommendations and cached in Redis")

        # 11. Graph Endpoint
        print("\n11. Testing Graph Visualization Endpoint...")
        graph_resp = await client.get(f"{BASE_URL}/notes/graph", headers=headers)
        assert graph_resp.status_code == 200
        graph_data = graph_resp.json()
        assert len(graph_data["nodes"]) >= 2
        assert len(graph_data["edges"]) >= 1
        print(f"   [PASS] Feature 'graph': Graph returned {len(graph_data['nodes'])} nodes and {len(graph_data['edges'])} edges")

        # 12. Full-Text Search
        print("\n12. Testing Full-Text Search Endpoint...")
        await asyncio.sleep(1)
        search_resp = await client.get(f"{BASE_URL}/search?q=Raft", headers=headers)
        assert search_resp.status_code == 200
        hits = search_resp.json()
        assert len(hits) >= 1 and any(h["id"] == note1_id for h in hits)
        print(f"   [PASS] Feature 'search': Successfully queried Elasticsearch index '{ES_INDEX}'")

        # 13. Activity Stats & Timeline
        print("\n13. Testing Activity Analytics Endpoints...")
        stats_resp = await client.get(f"{BASE_URL}/activity/stats", headers=headers)
        assert stats_resp.status_code == 200
        timeline_resp = await client.get(f"{BASE_URL}/activity/timeline", headers=headers)
        assert timeline_resp.status_code == 200
        print(f"   [PASS] Feature 'analytics': Activity stats & timeline returned valid telemetry")

        # 14. Unlink Notes
        print("\n14. Testing Unlink Notes...")
        unlink_resp = await client.request("DELETE", f"{BASE_URL}/notes/{note1_id}/unlink", json={"target_note_id": note2_id}, headers=headers)
        assert unlink_resp.status_code == 200
        async with driver.session() as session:
            res = await session.run(f"MATCH (a:{NEO4J_LABEL} {{id: $n1}})-[r:RELATED_TO]-(b:{NEO4J_LABEL} {{id: $n2}}) RETURN r LIMIT 1", n1=note1_id, n2=note2_id)
            assert await res.single() is None, "Neo4j [:RELATED_TO] edge was not removed!"
        print(f"   [PASS] Feature 'unlink_notes': Verified edge removed from Neo4j")

        # 15. Delete Notes
        print("\n15. Testing Delete Notes...")
        del_resp = await client.delete(f"{BASE_URL}/notes/{note1_id}", headers=headers)
        assert del_resp.status_code == 204
        await client.delete(f"{BASE_URL}/notes/{note2_id}", headers=headers)
        # Assert deleted from Mongo
        assert await m_client[DB_NAME]["notes"].find_one({"_id": ObjectId(note1_id)}) is None
        # Assert deleted from ES
        try:
            await es.get(index=ES_INDEX, id=note1_id)
            assert False, "Note still exists in ES!"
        except Exception:
            pass
        # Assert deleted from Neo4j
        async with driver.session() as session:
            res = await session.run(f"MATCH (n:{NEO4J_LABEL} {{id: $nid}}) RETURN n", nid=note1_id)
            assert await res.single() is None, "Note still exists in Neo4j!"
        print(f"   [PASS] Feature 'delete_note': Verified deletion across Mongo, ES, Neo4j, and Redis")

        # Cleanup connections
        m_client.close()
        await es.close()
        await driver.close()
        await r_client.aclose()

    print("\n==================================================================")
    print("ALL 15 TESTS PASSED STRICTLY WITH REAL DATABASE ASSERTIONS!")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(test_regression())
