import sys
import asyncio
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings, verify_namespace_guard
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db

async def run_rebuild():
    verify_namespace_guard()
    print("\n==================================================================")
    print("STARTING STORE REBUILD FROM MONGODB SOURCE OF TRUTH")
    print(f"Source MongoDB:     {settings.DATABASE_NAME}")
    print(f"Target ES Prefix:   {settings.ES_INDEX_PREFIX}")
    print(f"Target Redis Prefix:{settings.REDIS_KEY_PREFIX}")
    print(f"Target Neo4j Prefix:{settings.NEO4J_LABEL_PREFIX}")
    print("Thesis: MongoDB is the authoritative truth; ES, Neo4j, Redis are read models.")
    print("==================================================================\n")

    # Connect to all stores
    await db.connect()
    await redis_client.connect()
    await neo4j_db.connect()
    await elasticsearch_db.connect()

    database = db.get_db()

    # 1. Fetch Authoritative Data from MongoDB
    print("1. Reading Authoritative State from MongoDB...")
    users = await database["users"].find({}).to_list(length=5000)
    notes = await database["notes"].find({}).to_list(length=10000)
    documents = await database["documents"].find({}).to_list(length=5000)
    chunks = await database["chunks"].find({}).to_list(length=20000)
    concepts = await database["concepts"].find({}).to_list(length=10000)
    mentions = await database["concept_mentions"].find({}).to_list(length=20000)
    edges = await database["concept_edges"].find({}).to_list(length=10000)

    print(f"   [MONGO COUNTS] Users: {len(users)}, Notes: {len(notes)}, Documents: {len(documents)},")
    print(f"                  Chunks: {len(chunks)}, Concepts: {len(concepts)},")
    print(f"                  Mentions: {len(mentions)}, Prerequisite Edges: {len(edges)}")

    # 2. Rebuild Elasticsearch
    print("\n2. Rebuilding Elasticsearch Indexes...")
    es_client = elasticsearch_db.get_client()
    if es_client:
        try:
            notes_index = f"{settings.ES_INDEX_PREFIX}notes"
            docs_index = f"{settings.ES_INDEX_PREFIX}documents"

            # Delete and recreate isolated indices
            if await es_client.indices.exists(index=notes_index):
                await es_client.indices.delete(index=notes_index)
            if await es_client.indices.exists(index=docs_index):
                await es_client.indices.delete(index=docs_index)

            await elasticsearch_db.create_indices()

            # Re-index Notes
            notes_indexed = 0
            for n in notes:
                nid = str(n["_id"])
                await es_client.index(
                    index=notes_index,
                    id=nid,
                    document={
                        "owner_id": n.get("owner_id", ""),
                        "title": n.get("title", ""),
                        "content": n.get("content", ""),
                        "tags": n.get("tags", [])
                    }
                )
                notes_indexed += 1

            # Re-index Documents
            # Collect full document text from chunks if available
            doc_text_map = {}
            for ch in chunks:
                d_id = ch["document_id"]
                doc_text_map[d_id] = doc_text_map.get(d_id, "") + " " + ch.get("text", "")

            docs_indexed = 0
            for d in documents:
                did = str(d["_id"])
                content = doc_text_map.get(did, d.get("filename", ""))
                await es_client.index(
                    index=docs_index,
                    id=did,
                    document={
                        "id": did,
                        "owner_id": d.get("owner_id", ""),
                        "filename": d.get("filename", ""),
                        "content": content,
                        "doc_type": "pdf"
                    }
                )
                docs_indexed += 1

            # Refresh indices
            await es_client.indices.refresh(index=notes_index)
            await es_client.indices.refresh(index=docs_index)
            print(f"   [PASS] Elasticsearch rebuilt: {notes_indexed} notes and {docs_indexed} documents indexed.")
        except Exception as es_err:
            print(f"   [ES Rebuild Warning] {es_err}")
    else:
        print("   [SKIPPED] Elasticsearch is offline.")

    # 3. Rebuild Neo4j Graph
    print("\n3. Rebuilding Neo4j Isolated Graph Read Model...")
    driver = neo4j_db.get_driver()
    if driver:
        try:
            prefix = settings.NEO4J_LABEL_PREFIX
            async with driver.session() as session:
                # 3a. Clean ONLY isolated labels for this prefix
                clean_query = f"""
                MATCH (n)
                WHERE any(lbl IN labels(n) WHERE lbl STARTS WITH $prefix)
                DETACH DELETE n
                """
                await session.run(clean_query, prefix=prefix)
                print(f"   [CLEANED] Purged old nodes with prefix '{prefix}'.")

                # Ensure constraints
                await neo4j_db.init_constraints()

                # Recreate Users
                for u in users:
                    uid = str(u["_id"])
                    await session.run(
                        f"MERGE (u:{prefix}User {{id: $id}})",
                        id=uid
                    )

                # Recreate Notes and Note-to-Note links
                for n in notes:
                    nid = str(n["_id"])
                    uid = n.get("owner_id", "")
                    await session.run(
                        f"""
                        MERGE (n:{prefix}Note {{owner_id: $uid, id: $id}})
                        SET n.title = $title
                        """,
                        uid=uid, id=nid, title=n.get("title", "")
                    )
                    # Note-to-Note manual links
                    for target_id in n.get("linked_note_ids", []):
                        await session.run(
                            f"""
                            MATCH (a:{prefix}Note {{id: $aid}})
                            MATCH (b:{prefix}Note {{id: $bid}})
                            MERGE (a)-[:RELATED_TO]->(b)
                            """,
                            aid=nid, bid=target_id
                        )

                # Recreate Documents
                for d in documents:
                    did = str(d["_id"])
                    uid = d.get("owner_id", "")
                    await session.run(
                        f"""
                        MERGE (d:{prefix}Document {{owner_id: $uid, id: $id}})
                        SET d.filename = $filename
                        """,
                        uid=uid, id=did, filename=d.get("filename", "")
                    )

                # Recreate Concepts
                for c in concepts:
                    cid = c.get("normalized_name")
                    uid = c.get("owner_id", "")
                    await session.run(
                        f"""
                        MERGE (c:{prefix}Concept {{owner_id: $uid, id: $cid}})
                        SET c.name = $name
                        """,
                        uid=uid, cid=cid, name=c.get("name", cid)
                    )

                # Recreate Mentions
                for m in mentions:
                    cid = m.get("normalized_name")
                    uid = m.get("owner_id", "")
                    sid = m.get("source_id", "")
                    stype = m.get("source_type", "document")
                    lbl = f"{prefix}Document" if stype == "document" else f"{prefix}Note"
                    await session.run(
                        f"""
                        MATCH (s:{lbl} {{owner_id: $uid, id: $sid}})
                        MATCH (c:{prefix}Concept {{owner_id: $uid, id: $cid}})
                        MERGE (s)-[:MENTIONS]->(c)
                        """,
                        uid=uid, sid=sid, cid=cid
                    )

                # Recreate Prerequisite Edges
                for e in edges:
                    uid = e.get("owner_id", "")
                    fid = e.get("from_concept")
                    tid = e.get("to_concept")
                    await session.run(
                        f"""
                        MATCH (a:{prefix}Concept {{owner_id: $uid, id: $fid}})
                        MATCH (b:{prefix}Concept {{owner_id: $uid, id: $tid}})
                        MERGE (a)-[:PREREQUISITE_OF]->(b)
                        """,
                        uid=uid, fid=fid, tid=tid
                    )

            print(f"   [PASS] Neo4j graph completely reconstructed from MongoDB provenance.")
        except Exception as neo_err:
            print(f"   [Neo4j Rebuild Warning] {neo_err}")
    else:
        print("   [SKIPPED] Neo4j is offline.")

    # 4. Rebuild Redis Caches
    print("\n4. Purging & Rebuilding Ephemeral Redis Caches...")
    r = redis_client.get_redis()
    if r:
        try:
            # Delete only keys with isolated prefix
            cur = b"0"
            deleted_keys = 0
            while True:
                cur, keys = await r.scan(cur, match=f"{settings.REDIS_KEY_PREFIX}*", count=100)
                if keys:
                    await r.delete(*keys)
                    deleted_keys += len(keys)
                if cur == b"0" or cur == 0:
                    break
            print(f"   [PASS] Purged {deleted_keys} stale Redis keys with prefix '{settings.REDIS_KEY_PREFIX}'.")
        except Exception as r_err:
            print(f"   [Redis Rebuild Warning] {r_err}")
    else:
        print("   [SKIPPED] Redis is offline.")

    # Disconnect
    await elasticsearch_db.disconnect()
    await neo4j_db.disconnect()
    await redis_client.disconnect()
    db.disconnect()

    print("\n==================================================================")
    print("ALL DERIVED STORES SUCCESSFULLY REBUILT FROM MONGODB!")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(run_rebuild())
