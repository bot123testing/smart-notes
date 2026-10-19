import io
import sys
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from bson import ObjectId
from pypdf import PdfWriter

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings, verify_namespace_guard
from app.core.security import get_password_hash
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db
from app.services.document_service import process_and_save_upload, UPLOAD_DIR
from app.services.chunking_service import extract_and_chunk_pdf
from app.services.concept_extraction_service import extract_concepts_from_text, normalize_concept_name
from app.services.study_path_service import toggle_known_concept, invalidate_user_study_cache

DEMO_USER_EMAIL = "demo@studypath.io"
DEMO_USER_PASSWORD = "demopass123"

def make_pdf(title: str, text: str) -> bytes:
    """Generates a valid in-memory PDF with distinct title and content metadata."""
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.add_metadata({"/Title": title, "/Subject": text[:200]})
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

async def run_seed():
    verify_namespace_guard()
    print("\n==================================================================")
    print("STARTING STUDY PATH BUILDER DEMO SEEDING")
    print(f"Target Database:    {settings.DATABASE_NAME}")
    print(f"ES Prefix:          {settings.ES_INDEX_PREFIX}")
    print(f"Redis Prefix:       {settings.REDIS_KEY_PREFIX}")
    print(f"Neo4j Prefix:       {settings.NEO4J_LABEL_PREFIX}")
    print("==================================================================\n")

    # Connect to stores
    await db.connect()
    await redis_client.connect()
    await neo4j_db.connect()
    await elasticsearch_db.connect()

    database = db.get_db()
    now = datetime.now(timezone.utc)

    # 1. Create or retrieve Demo User
    print("1. Creating / Updating Demo User Account...")
    demo_user = await database["users"].find_one({"email": DEMO_USER_EMAIL})
    if not demo_user:
        hashed_pwd = get_password_hash(DEMO_USER_PASSWORD)
        res = await database["users"].insert_one({
            "email": DEMO_USER_EMAIL,
            "hashed_password": hashed_pwd,
            "full_name": "StudyPath Demo Student",
            "created_at": now
        })
        user_id = str(res.inserted_id)
        print(f"   [CREATED] Demo user created with ID: {user_id}")
    else:
        user_id = str(demo_user["_id"])
        print(f"   [FOUND] Existing demo user with ID: {user_id}")

    # 2. Seed Text Notes
    print("\n2. Seeding Typed Notes with Concept Provenance...")
    demo_notes = [
        {
            "title": "Byzantine Fault Tolerance and Quorums",
            "content": "Byzantine fault tolerance addresses arbitrary and malicious failure modes in distributed networks. Quorum Consensus ensures that overlapping majorities agree on state machine transitions before any commit. Raft Consensus and Paxos provide crash-fault tolerance under asynchronous network assumptions.",
            "tags": ["distributed-systems", "consensus", "byzantine"],
            "concepts": ["Byzantine Fault Tolerance", "Quorum Consensus", "Raft Consensus", "Paxos"],
            "prereqs": [
                {"from_concept": "Quorum Consensus", "to_concept": "Paxos"},
                {"from_concept": "Paxos", "to_concept": "Byzantine Fault Tolerance"}
            ]
        },
        {
            "title": "Memory Hierarchies and In-Memory Caching",
            "content": "Modern high-throughput architectures rely heavily on In-Memory Caching to bypass mechanical and solid-state disk latency bottlenecks. Redis Data Structures offer O(1) key lookups for session management, leaderboard ranking, and real-time pub-sub streaming.",
            "tags": ["redis", "caching", "architecture"],
            "concepts": ["In-Memory Caching", "Redis Data Structures"],
            "prereqs": [
                {"from_concept": "In-Memory Caching", "to_concept": "Redis Data Structures"}
            ]
        }
    ]

    es_client = elasticsearch_db.get_client()
    driver = neo4j_db.get_driver()

    for n_data in demo_notes:
        existing_note = await database["notes"].find_one({"owner_id": user_id, "title": n_data["title"]})
        if existing_note:
            note_id = str(existing_note["_id"])
            print(f"   [NOTE EXISTS] {n_data['title']} (ID: {note_id})")
        else:
            n_doc = {
                "owner_id": user_id,
                "title": n_data["title"],
                "content": n_data["content"],
                "tags": n_data["tags"],
                "linked_note_ids": [],
                "created_at": now,
                "updated_at": now
            }
            n_res = await database["notes"].insert_one(n_doc)
            note_id = str(n_res.inserted_id)
            print(f"   [CREATED NOTE] {n_data['title']} (ID: {note_id})")

        # Sync Note to ES
        if es_client:
            try:
                await es_client.index(
                    index=f"{settings.ES_INDEX_PREFIX}notes",
                    id=note_id,
                    document={
                        "owner_id": user_id,
                        "title": n_data["title"],
                        "content": n_data["content"],
                        "tags": n_data["tags"]
                    }
                )
            except Exception as e:
                print(f"   [ES Note Warning] {e}")

        # Sync Note to Neo4j
        if driver:
            try:
                async with driver.session() as session:
                    q = f"""
                    MERGE (n:{settings.NEO4J_LABEL_PREFIX}Note {{owner_id: $owner_id, id: $id}})
                    SET n.title = $title
                    """
                    await session.run(q, owner_id=user_id, id=note_id, title=n_data["title"])
            except Exception as e:
                print(f"   [Neo4j Note Warning] {e}")

        # Record mentions and concepts for this note
        for cname in n_data["concepts"]:
            cid = normalize_concept_name(cname)
            await database["concepts"].update_one(
                {"owner_id": user_id, "normalized_name": cid},
                {
                    "$set": {"name": cname, "normalized_name": cid, "updated_at": now},
                    "$setOnInsert": {"owner_id": user_id, "description": f"Core concept: {cname}.", "created_at": now},
                    "$inc": {"mention_count": 1}
                },
                upsert=True
            )
            await database["concept_mentions"].update_one(
                {"owner_id": user_id, "normalized_name": cid, "source_id": note_id},
                {
                    "$set": {
                        "owner_id": user_id,
                        "concept_name": cname,
                        "normalized_name": cid,
                        "source_id": note_id,
                        "source_type": "note",
                        "snippet": n_data["content"][:150],
                        "created_at": now
                    }
                },
                upsert=True
            )
            if driver:
                try:
                    async with driver.session() as session:
                        q_c = f"""
                        MERGE (c:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $cid}})
                        SET c.name = $name
                        WITH c
                        MATCH (n:{settings.NEO4J_LABEL_PREFIX}Note {{owner_id: $owner_id, id: $nid}})
                        MERGE (n)-[:MENTIONS]->(c)
                        """
                        await session.run(q_c, owner_id=user_id, cid=cid, name=cname, nid=note_id)
                except Exception:
                    pass

    # 3. Seed PDF Documents
    print("\n3. Seeding PDF Documents with Sliding-Window Chunks & Concepts...")
    demo_docs = [
        {
            "filename": "Distributed_Consensus_Raft.pdf",
            "content": "Distributed systems require consensus algorithms to ensure fault tolerance. Leader Election is the first phase of Raft Consensus. Raft consensus ensures all nodes maintain a replicated Distributed State Machine. Log replication guarantees that state machine transitions are committed in identical order across quorum members.",
            "concepts": ["Leader Election", "Raft Consensus", "Distributed State Machine"],
            "prereqs": [
                {"from_concept": "Leader Election", "to_concept": "Raft Consensus"},
                {"from_concept": "Raft Consensus", "to_concept": "Distributed State Machine"}
            ]
        },
        {
            "filename": "CAP_Theorem_and_Consistency.pdf",
            "content": "The CAP Theorem states that a distributed data store can simultaneously provide at most two out of three guarantees: Consistency, Availability, and Partition Tolerance. When a Network Partition occurs, systems must trade off Linearizability against continuous uptime. PACELC extends this theorem during normal operational conditions.",
            "concepts": ["Network Partition", "CAP Theorem", "Linearizability"],
            "prereqs": [
                {"from_concept": "Network Partition", "to_concept": "CAP Theorem"},
                {"from_concept": "CAP Theorem", "to_concept": "Linearizability"}
            ]
        },
        {
            "filename": "Redis_Internal_Architecture.pdf",
            "content": "Redis operates as an In-Memory Caching engine utilizing an asynchronous event loop and single-threaded execution. Redis Data Structures include strings, hashes, sorted sets, and bitfields. Durability is achieved via Append-Only File (AOF Persistence) and periodic background RDB snapshotting.",
            "concepts": ["In-Memory Caching", "Redis Data Structures", "AOF Persistence"],
            "prereqs": [
                {"from_concept": "In-Memory Caching", "to_concept": "Redis Data Structures"},
                {"from_concept": "Redis Data Structures", "to_concept": "AOF Persistence"}
            ]
        }
    ]

    for d_data in demo_docs:
        existing_doc = await database["documents"].find_one({"owner_id": user_id, "filename": d_data["filename"]})
        pdf_bytes = make_pdf(d_data["filename"], d_data["content"])

        if existing_doc:
            doc_id = str(existing_doc["_id"])
            print(f"   [DOC EXISTS] {d_data['filename']} (ID: {doc_id})")
        else:
            # Save file to storage
            storage_path = UPLOAD_DIR / f"{user_id}_{d_data['filename']}"
            with open(storage_path, "wb") as f:
                f.write(pdf_bytes)

            import hashlib
            file_sha = hashlib.sha256(pdf_bytes).hexdigest()

            doc_record = {
                "owner_id": user_id,
                "filename": d_data["filename"],
                "storage_path": str(storage_path),
                "file_size_bytes": len(pdf_bytes),
                "page_count": 2,
                "file_sha256": file_sha,
                "status": "ready",
                "chunk_count": 1,
                "created_at": now,
                "updated_at": now
            }
            d_res = await database["documents"].insert_one(doc_record)
            doc_id = str(d_res.inserted_id)

            # Insert Chunk
            chunk_record = {
                "owner_id": user_id,
                "document_id": doc_id,
                "chunk_index": 0,
                "page_number": 1,
                "text": d_data["content"],
                "word_count": len(d_data["content"].split()),
                "content_hash": hashlib.sha256(d_data["content"].encode()).hexdigest(),
                "created_at": now
            }
            await database["chunks"].insert_one(chunk_record)
            print(f"   [CREATED DOC] {d_data['filename']} (ID: {doc_id})")

        # Sync Document to ES
        if es_client:
            try:
                await es_client.index(
                    index=f"{settings.ES_INDEX_PREFIX}documents",
                    id=doc_id,
                    document={
                        "id": doc_id,
                        "owner_id": user_id,
                        "filename": d_data["filename"],
                        "content": d_data["content"],
                        "doc_type": "pdf"
                    }
                )
            except Exception as e:
                print(f"   [ES Doc Warning] {e}")

        # Sync Document to Neo4j
        if driver:
            try:
                async with driver.session() as session:
                    q = f"""
                    MERGE (d:{settings.NEO4J_LABEL_PREFIX}Document {{owner_id: $owner_id, id: $id}})
                    SET d.filename = $filename
                    """
                    await session.run(q, owner_id=user_id, id=doc_id, filename=d_data["filename"])
            except Exception as e:
                print(f"   [Neo4j Doc Warning] {e}")

        # Record Concepts, Mentions, and Edges
        for cname in d_data["concepts"]:
            cid = normalize_concept_name(cname)
            await database["concepts"].update_one(
                {"owner_id": user_id, "normalized_name": cid},
                {
                    "$set": {"name": cname, "normalized_name": cid, "updated_at": now},
                    "$setOnInsert": {"owner_id": user_id, "description": f"Core concept: {cname}.", "created_at": now},
                    "$inc": {"mention_count": 1}
                },
                upsert=True
            )
            await database["concept_mentions"].update_one(
                {"owner_id": user_id, "normalized_name": cid, "source_id": doc_id},
                {
                    "$set": {
                        "owner_id": user_id,
                        "concept_name": cname,
                        "normalized_name": cid,
                        "source_id": doc_id,
                        "source_type": "document",
                        "snippet": d_data["content"][:150],
                        "created_at": now
                    }
                },
                upsert=True
            )
            if driver:
                try:
                    async with driver.session() as session:
                        q_c = f"""
                        MERGE (c:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $cid}})
                        SET c.name = $name
                        WITH c
                        MATCH (d:{settings.NEO4J_LABEL_PREFIX}Document {{owner_id: $owner_id, id: $did}})
                        MERGE (d)-[:MENTIONS]->(c)
                        """
                        await session.run(q_c, owner_id=user_id, cid=cid, name=cname, did=doc_id)
                except Exception:
                    pass

        # Record Edges
        for p in d_data["prereqs"]:
            f_norm = normalize_concept_name(p["from_concept"])
            t_norm = normalize_concept_name(p["to_concept"])
            await database["concept_edges"].update_one(
                {"owner_id": user_id, "from_concept": f_norm, "to_concept": t_norm},
                {
                    "$set": {
                        "owner_id": user_id,
                        "from_concept": f_norm,
                        "to_concept": t_norm,
                        "from_name": p["from_concept"],
                        "to_name": p["to_concept"],
                        "relationship": "PREREQUISITE_OF",
                        "source_id": doc_id,
                        "source_type": "document",
                        "created_at": now
                    }
                },
                upsert=True
            )
            if driver:
                try:
                    async with driver.session() as session:
                        q_e = f"""
                        MATCH (a:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $fid}})
                        MATCH (b:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $tid}})
                        MERGE (a)-[:PREREQUISITE_OF]->(b)
                        """
                        await session.run(q_e, owner_id=user_id, fid=f_norm, tid=t_norm)
                except Exception:
                    pass

    # 4. Seed Known Concepts (Student Progress)
    print("\n4. Setting Up Student Progress (Known Concepts)...")
    initial_known = ["leader_election", "network_partition", "in_memory_caching"]
    for k_cid in initial_known:
        await toggle_known_concept(k_cid, user_id, mark_known=True, database=database)
    print(f"   [PASS] Marked foundational concepts as known: {initial_known}")

    # 5. Invalidate Redis Caches
    print("\n5. Refreshing Redis Study Path Caches...")
    await invalidate_user_study_cache(user_id)
    print("   [PASS] Cleaned stale Redis keys.")

    # Disconnect
    await elasticsearch_db.disconnect()
    await neo4j_db.disconnect()
    await redis_client.disconnect()
    db.disconnect()

    print("\n==================================================================")
    print("DEMO SEEDING COMPLETED SUCCESSFULLY!")
    print(f"Login Credentials:  {DEMO_USER_EMAIL} / {DEMO_USER_PASSWORD}")
    print("Concepts Seeded:    Leader Election, Raft Consensus, State Machine,")
    print("                    CAP Theorem, Linearizability, In-Memory Caching,")
    print("                    Redis Data Structures, AOF Persistence, Paxos")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(run_seed())
