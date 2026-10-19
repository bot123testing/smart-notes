import sys
import asyncio
import argparse
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings, verify_namespace_guard
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db

async def run_consistency_check(break_store: str = None):
    verify_namespace_guard()
    print("\n==================================================================")
    print("CROSS-STORE POLYGLOT PERSISTENCE CONSISTENCY AUDIT")
    print(f"Authoritative Truth: MongoDB ({settings.DATABASE_NAME})")
    print(f"ES Index Prefix:     {settings.ES_INDEX_PREFIX}")
    print(f"Neo4j Label Prefix:  {settings.NEO4J_LABEL_PREFIX}")
    print(f"Redis Key Prefix:    {settings.REDIS_KEY_PREFIX}")
    print("==================================================================\n")

    # Connect to stores
    await db.connect()
    await redis_client.connect()
    await neo4j_db.connect()
    await elasticsearch_db.connect()

    database = db.get_db()
    es_client = elasticsearch_db.get_client()
    driver = neo4j_db.get_driver()
    r = redis_client.get_redis()

    # Intentional drift injection for viva demonstration
    if break_store == "es" and es_client:
        print("⚠️ [DEMO DRIFT INJECTION] Deliberately deleting a note from Elasticsearch...")
        sample = await database["notes"].find_one({})
        if sample:
            s_id = str(sample["_id"])
            try:
                await es_client.delete(index=f"{settings.ES_INDEX_PREFIX}notes", id=s_id, refresh=True)
                print(f"   [DRIFT INJECTED] Deleted note ID '{s_id}' from ES index '{settings.ES_INDEX_PREFIX}notes'.\n")
            except Exception as e:
                print(f"   [Drift injection warning] {e}")

    # 1. Gather MongoDB Counts
    mongo_notes_count = await database["notes"].count_documents({})
    mongo_docs_count = await database["documents"].count_documents({})
    mongo_concepts_count = await database["concepts"].count_documents({})
    mongo_edges_count = await database["concept_edges"].count_documents({})
    mongo_mentions_count = await database["concept_mentions"].count_documents({})

    # 2. Gather Elasticsearch Counts
    es_notes_count = "OFFLINE"
    es_docs_count = "OFFLINE"
    if es_client:
        try:
            n_res = await es_client.count(index=f"{settings.ES_INDEX_PREFIX}notes")
            es_notes_count = n_res.get("count", 0)
        except Exception:
            es_notes_count = 0

        try:
            d_res = await es_client.count(index=f"{settings.ES_INDEX_PREFIX}documents")
            es_docs_count = d_res.get("count", 0)
        except Exception:
            es_docs_count = 0

    # 3. Gather Neo4j Counts
    neo_notes_count = "OFFLINE"
    neo_docs_count = "OFFLINE"
    neo_concepts_count = "OFFLINE"
    neo_edges_count = "OFFLINE"
    neo_mentions_count = "OFFLINE"

    if driver:
        try:
            prefix = settings.NEO4J_LABEL_PREFIX
            async with driver.session() as session:
                r1 = await session.run(f"MATCH (n:{prefix}Note) RETURN count(n) AS c")
                neo_notes_count = (await r1.single())["c"]

                r2 = await session.run(f"MATCH (d:{prefix}Document) RETURN count(d) AS c")
                neo_docs_count = (await r2.single())["c"]

                r3 = await session.run(f"MATCH (c:{prefix}Concept) RETURN count(c) AS c")
                neo_concepts_count = (await r3.single())["c"]

                r4 = await session.run(f"MATCH ()-[r:PREREQUISITE_OF]->() RETURN count(r) AS c")
                neo_edges_count = (await r4.single())["c"]

                r5 = await session.run(f"MATCH ()-[r:MENTIONS]->() RETURN count(r) AS c")
                neo_mentions_count = (await r5.single())["c"]
        except Exception as e:
            print(f"[Neo4j Query Warning] {e}")

    # 4. Gather Redis Cache Status
    redis_keys_count = "OFFLINE"
    if r:
        try:
            cur = b"0"
            count = 0
            while True:
                cur, keys = await r.scan(cur, match=f"{settings.REDIS_KEY_PREFIX}*", count=100)
                count += len(keys)
                if cur == b"0" or cur == 0:
                    break
            redis_keys_count = count
        except Exception:
            redis_keys_count = 0

    # Evaluate Consistency
    all_passed = True
    table_rows = []

    # Row 1: Notes
    notes_ok = (es_notes_count in [mongo_notes_count, "OFFLINE"]) and (neo_notes_count in [mongo_notes_count, "OFFLINE"])
    if es_notes_count not in ["OFFLINE", mongo_notes_count] or neo_notes_count not in ["OFFLINE", mongo_notes_count]:
        notes_ok = False
        all_passed = False
    table_rows.append(("Notes", mongo_notes_count, es_notes_count, neo_notes_count, "PASS" if notes_ok else "FAIL (DRIFT)"))

    # Row 2: Documents
    docs_ok = (es_docs_count in [mongo_docs_count, "OFFLINE"]) and (neo_docs_count in [mongo_docs_count, "OFFLINE"])
    if es_docs_count not in ["OFFLINE", mongo_docs_count] or neo_docs_count not in ["OFFLINE", mongo_docs_count]:
        docs_ok = False
        all_passed = False
    table_rows.append(("Documents", mongo_docs_count, es_docs_count, neo_docs_count, "PASS" if docs_ok else "FAIL (DRIFT)"))

    # Row 3: Concepts
    concepts_ok = (neo_concepts_count in [mongo_concepts_count, "OFFLINE"])
    if neo_concepts_count not in ["OFFLINE", mongo_concepts_count]:
        concepts_ok = False
        all_passed = False
    table_rows.append(("Concepts", mongo_concepts_count, "N/A (Derived)", neo_concepts_count, "PASS" if concepts_ok else "FAIL (DRIFT)"))

    # Row 4: Prerequisite Edges
    edges_ok = (neo_edges_count in [mongo_edges_count, "OFFLINE"])
    if neo_edges_count not in ["OFFLINE", mongo_edges_count]:
        edges_ok = False
        all_passed = False
    table_rows.append(("Prerequisite Edges", mongo_edges_count, "N/A (Graph-Only)", neo_edges_count, "PASS" if edges_ok else "FAIL (DRIFT)"))

    # Row 5: Mentions Edges
    mentions_ok = (neo_mentions_count in [mongo_mentions_count, "OFFLINE"])
    if neo_mentions_count not in ["OFFLINE", mongo_mentions_count]:
        mentions_ok = False
        all_passed = False
    table_rows.append(("Mentions Edges", mongo_mentions_count, "N/A (Graph-Only)", neo_mentions_count, "PASS" if mentions_ok else "FAIL (DRIFT)"))

    # Print Formatted Report Table
    header = f"| {'Entity / Relationship':<22} | {'MongoDB (Truth)':<15} | {'Elasticsearch':<15} | {'Neo4j':<15} | {'Status':<12} |"
    sep = "|" + "-"*24 + "|" + "-"*17 + "|" + "-"*17 + "|" + "-"*17 + "|" + "-"*14 + "|"

    print(sep)
    print(header)
    print(sep)
    for row in table_rows:
        print(f"| {row[0]:<22} | {str(row[1]):<15} | {str(row[2]):<15} | {str(row[3]):<15} | {row[4]:<12} |")
    print(sep)
    print(f"| {'Active Redis Cache Keys':<22} | {'N/A (Ephemeral)':<15} | {'N/A':<15} | {'N/A':<15} | {str(redis_keys_count) + ' keys':<12} |")
    print(sep + "\n")

    # Sample ID Verification
    print("5. Sample ID Verification across Stores...")
    sample_notes = await database["notes"].find({}).limit(3).to_list(length=3)
    for s_note in sample_notes:
        nid = str(s_note["_id"])
        es_found = "N/A"
        if es_client:
            try:
                es_found = "FOUND" if await es_client.exists(index=f"{settings.ES_INDEX_PREFIX}notes", id=nid) else "MISSING"
            except Exception:
                es_found = "ERROR"
        neo_found = "N/A"
        if driver:
            try:
                async with driver.session() as session:
                    res = await session.run(f"MATCH (n:{settings.NEO4J_LABEL_PREFIX}Note {{id: $id}}) RETURN n", id=nid)
                    neo_found = "FOUND" if await res.single() else "MISSING"
            except Exception:
                neo_found = "ERROR"
        print(f"   - Note '{s_note.get('title', nid)[:30]}': Mongo=EXISTS, ES={es_found}, Neo4j={neo_found}")

    # Disconnect
    await elasticsearch_db.disconnect()
    await neo4j_db.disconnect()
    await redis_client.disconnect()
    db.disconnect()

    if all_passed:
        print("\n==================================================================")
        print(">>> OVERALL AUDIT: [PASS] ALL DERIVED READ MODELS ARE IN SYNC! <<<")
        print("==================================================================\n")
        return 0
    else:
        print("\n==================================================================")
        print(">>> OVERALL AUDIT: [FAIL] DISCREPANCY DETECTED! <<<")
        print("Run `python scripts/rebuild.py` to restore consistency from MongoDB.")
        print("==================================================================\n")
        return 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cross-store consistency audit tool")
    parser.add_argument("--break-es", action="store_true", help="Deliberately delete an ES document to demonstrate drift detection in viva")
    args = parser.parse_args()

    break_choice = "es" if args.break_es else None
    code = asyncio.run(run_consistency_check(break_store=break_choice))
    sys.exit(code)
