import asyncio
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db
from app.core.config import settings

async def audit():
    print("=== 1. MONGODB ===")
    await db.connect()
    database = db.get_db()
    for col in ['users', 'notes', 'documents', 'chunks', 'concepts', 'concept_edges', 'concept_mentions', 'user_known_concepts']:
        count = await database[col].count_documents({})
        print(f"  Collection '{col}': {count} documents")

    print("\n=== 2. REDIS ===")
    await redis_client.connect()
    r = redis_client.get_redis()
    if r:
        try:
            keys = await r.keys(f"{settings.REDIS_KEY_PREFIX}*")
            print(f"  Prefix: '{settings.REDIS_KEY_PREFIX}'")
            print(f"  Active Keys count: {len(keys)}")
            for k in keys[:5]:
                k_str = k.decode() if isinstance(k, bytes) else k
                ttl = await r.ttl(k)
                print(f"    - {k_str} (TTL: {ttl}s)")
        except Exception as re:
            print("  Redis error:", re)

    print("\n=== 3. ELASTICSEARCH ===")
    await elasticsearch_db.connect()
    es = elasticsearch_db.get_client()
    if es:
        try:
            indices = await es.cat.indices(format='json')
            for idx in indices:
                iname = idx.get('index', '')
                if 'studypath' in iname or 'note' in iname:
                    print(f"  Index '{iname}': {idx.get('docs.count')} docs (health: {idx.get('health')})")
        except Exception as ee:
            print("  ES error:", ee)

    print("\n=== 4. NEO4J ===")
    await neo4j_db.connect()
    driver = neo4j_db.get_driver()
    if driver:
        try:
            async with driver.session() as s:
                res1 = await s.run(f"MATCH (c:{settings.NEO4J_LABEL_PREFIX}Concept) RETURN count(c) as count")
                d1 = await res1.data()
                res2 = await s.run("MATCH ()-[r:PREREQUISITE_OF]->() RETURN count(r) as count")
                d2 = await res2.data()
                res3 = await s.run(f"MATCH (n) RETURN labels(n) as lbl, count(n) as count")
                d3 = await res3.data()
                print(f"  Label Prefix: '{settings.NEO4J_LABEL_PREFIX}'")
                print(f"  Concept Nodes (:{settings.NEO4J_LABEL_PREFIX}Concept): {d1[0]['count']}")
                print(f"  Edges ([:PREREQUISITE_OF]): {d2[0]['count']}")
                for row in d3:
                    print(f"    - {row['lbl']}: {row['count']} nodes")
        except Exception as ne:
            print("  Neo4j error:", ne)

if __name__ == '__main__':
    asyncio.run(audit())
