import sys
import asyncio
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from neo4j import AsyncGraphDatabase
from elasticsearch import AsyncElasticsearch

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings, verify_namespace_guard

async def check():
    verify_namespace_guard()


    print("==========================================")
    print("VERIFYING CONNECTIVITY TO ALL 4 DATABASES")
    print("==========================================")
    
    # 1. MongoDB
    print("1. Checking MongoDB...")
    mc = AsyncIOMotorClient(settings.MONGODB_URL)
    await mc.admin.command('ping')
    print("   [OK] MongoDB Reachable (Port 27017)")
    mc.close()

    # 2. Redis
    print("2. Checking Redis...")
    rc = redis.from_url(settings.redis_url, protocol=2)
    res = await rc.ping()
    print(f"   [OK] Redis Reachable (Port 6379, PING -> {res})")
    await rc.aclose()

    # 3. Neo4j
    print("3. Checking Neo4j...")
    drv = AsyncGraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
    await drv.verify_connectivity()
    print("   [OK] Neo4j Authenticated Connectivity Verified (Port 7687)")
    await drv.close()

    # 4. Elasticsearch
    print("4. Checking Elasticsearch...")
    es = AsyncElasticsearch(settings.elasticsearch_url)
    info = await es.info()
    print(f"   [OK] Elasticsearch Reachable (Port 9200, Version: {info['version']['number']})")
    await es.close()

    print("\nALL FOUR STORES ARE FULLY REACHABLE AND HEALTHY!\n")

if __name__ == "__main__":
    asyncio.run(check())
