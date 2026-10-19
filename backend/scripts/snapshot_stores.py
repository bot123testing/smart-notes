import sys
import json
import asyncio
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from neo4j import AsyncGraphDatabase
from elasticsearch import AsyncElasticsearch
from app.core.config import settings

SNAPSHOTS_DIR = Path(__file__).resolve().parent.parent / "snapshots"
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

async def take_snapshot(snapshot_name: str = "snapshot.json"):
    snapshot = {
        "mongodb": {},
        "redis": {},
        "elasticsearch": {},
        "neo4j": {}
    }

    # 1. MongoDB - smartnotes database
    try:
        mc = AsyncIOMotorClient(settings.MONGODB_URL)
        db = mc["smartnotes"]
        cols = await db.list_collection_names()
        for col in cols:
            count = await db[col].count_documents({})
            snapshot["mongodb"][f"smartnotes.{col}"] = count
        mc.close()
    except Exception as e:
        snapshot["mongodb"]["error"] = str(e)

    # 2. Redis - non-sp: keys
    try:
        r = redis.from_url(settings.redis_url, protocol=2, decode_responses=True)
        keys = await r.keys("*")
        non_sp_keys = [k for k in keys if not k.startswith("sp:")]
        snapshot["redis"] = {
            "non_sp_key_count": len(non_sp_keys),
            "non_sp_keys": sorted(non_sp_keys)
        }
        await r.aclose()
    except Exception as e:
        snapshot["redis"]["error"] = str(e)

    # 3. Elasticsearch - unprefixed "notes" index
    try:
        es = AsyncElasticsearch(settings.elasticsearch_url)
        exists = await es.indices.exists(index="notes")
        if exists:
            count_res = await es.count(index="notes")
            snapshot["elasticsearch"] = {
                "notes_index_exists": True,
                "notes_doc_count": count_res["count"]
            }
        else:
            snapshot["elasticsearch"] = {
                "notes_index_exists": False,
                "notes_doc_count": 0
            }
        await es.close()
    except Exception as e:
        snapshot["elasticsearch"]["error"] = str(e)

    # 4. Neo4j - unprefixed :Note, :User, :RELATED_TO
    try:
        drv = AsyncGraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
        async with drv.session() as session:
            r1 = await session.run("MATCH (n:Note) RETURN count(n) AS cnt")
            d1 = await r1.single()
            note_cnt = d1["cnt"] if d1 else 0

            r2 = await session.run("MATCH (u:User) RETURN count(u) AS cnt")
            d2 = await r2.single()
            user_cnt = d2["cnt"] if d2 else 0

            r3 = await session.run("MATCH ()-[r:RELATED_TO]->() RETURN count(r) AS cnt")
            d3 = await r3.single()
            rel_cnt = d3["cnt"] if d3 else 0

            snapshot["neo4j"] = {
                "Note_node_count": note_cnt,
                "User_node_count": user_cnt,
                "RELATED_TO_edge_count": rel_cnt
            }
        await drv.close()
    except Exception as e:
        snapshot["neo4j"]["error"] = str(e)

    out_file = SNAPSHOTS_DIR / snapshot_name
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)

    print(f"Snapshot written to {out_file}:")
    print(json.dumps(snapshot, indent=2))
    return snapshot

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "pre_regression_snapshot.json"
    asyncio.run(take_snapshot(name))
