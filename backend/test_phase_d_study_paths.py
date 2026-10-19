import io
import asyncio
import httpx
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from pypdf import PdfWriter
from bson import ObjectId

BASE_URL = "http://127.0.0.1:8000/api"
DB_NAME = "smartnotes_studypath"

def create_sample_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

async def run_phase_d_tests():
    print("\n==================================================================")
    print("RUNNING PHASE D STUDY PATH & GRAPH ALGORITHMS INTEGRATION TESTS")
    print("==================================================================\n")

    m_client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    database = m_client[DB_NAME]

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Setup User A and User B
        print("1. Setting up User A & User B...")
        u_suffix = uuid.uuid4().hex[:6]
        email_a, email_b = f"user_a_{u_suffix}@example.com", f"user_b_{u_suffix}@example.com"
        pwd = "password123"

        res_a = await client.post(f"{BASE_URL}/auth/register", json={"email": email_a, "password": pwd})
        assert res_a.status_code == 200
        user_a_id = res_a.json()["id"]

        res_b = await client.post(f"{BASE_URL}/auth/register", json={"email": email_b, "password": pwd})
        assert res_b.status_code == 200
        user_b_id = res_b.json()["id"]

        login_a = await client.post(f"{BASE_URL}/auth/login", data={"username": email_a, "password": pwd})
        headers_a = {"Authorization": f"Bearer {login_a.json()['access_token']}"}

        login_b = await client.post(f"{BASE_URL}/auth/login", data={"username": email_b, "password": pwd})
        headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}
        print(f"   [PASS] User A ({user_a_id}) and User B ({user_b_id}) ready.")

        # 2. Seed Linear Prerequisite Graph for User A
        # Leader Election -> Raft Consensus -> Distributed State Machine
        print("\n2. Seeding Prerequisite Graph for User A...")
        concepts_to_seed = [
            {"owner_id": user_a_id, "name": "Leader Election", "normalized_name": "leader_election", "description": "Mechanism to choose a single coordinator."},
            {"owner_id": user_a_id, "name": "Raft Consensus", "normalized_name": "raft_consensus", "description": "Consensus algorithm for managing a replicated log."},
            {"owner_id": user_a_id, "name": "Distributed State Machine", "normalized_name": "distributed_state_machine", "description": "Replicated state machine architecture."}
        ]
        for c in concepts_to_seed:
            await database["concepts"].update_one(
                {"owner_id": user_a_id, "normalized_name": c["normalized_name"]},
                {"$set": c},
                upsert=True
            )

        edges_to_seed = [
            {"owner_id": user_a_id, "from_concept": "leader_election", "to_concept": "raft_consensus", "from_name": "Leader Election", "to_name": "Raft Consensus", "source_id": "seed_doc_1"},
            {"owner_id": user_a_id, "from_concept": "raft_consensus", "to_concept": "distributed_state_machine", "from_name": "Raft Consensus", "to_name": "Distributed State Machine", "source_id": "seed_doc_1"}
        ]
        for e in edges_to_seed:
            await database["concept_edges"].update_one(
                {"owner_id": user_a_id, "from_concept": e["from_concept"], "to_concept": e["to_concept"]},
                {"$set": e},
                upsert=True
            )
        print("   [PASS] Prerequisite graph seeded: Leader Election -> Raft Consensus -> Distributed State Machine.")

        # 3. Test Topological Study Path Ordering
        print("\n3. Testing Topological Study Path Ordering...")
        path_resp = await client.get(f"{BASE_URL}/study-paths/path/distributed_state_machine", headers=headers_a)
        assert path_resp.status_code == 200, path_resp.text
        path_data = path_resp.json()

        assert path_data["target_concept_id"] == "distributed_state_machine"
        assert path_data["total_steps"] == 3
        assert path_data["has_cycle"] is False
        assert len(path_data["cycle_warnings"]) == 0

        step_cids = [s["concept_id"] for s in path_data["steps"]]
        assert step_cids == ["leader_election", "raft_consensus", "distributed_state_machine"], f"Invalid topological order: {step_cids}"
        assert path_data["steps"][0]["depth"] == 0
        assert path_data["steps"][1]["depth"] == 1
        assert path_data["steps"][2]["depth"] == 2
        print(f"   [PASS] Perfect topological sort: {step_cids} with monotonically increasing depths.")

        # 4. Test Cycle Detection and Safe Feedback Arc Breaking
        print("\n4. Testing Cycle Detection and Safe Cycle Breaking...")
        # Introduce cycle: Distributed State Machine -> Leader Election
        cycle_edge = {
            "owner_id": user_a_id,
            "from_concept": "distributed_state_machine",
            "to_concept": "leader_election",
            "from_name": "Distributed State Machine",
            "to_name": "Leader Election",
            "source_id": "cycle_seed"
        }
        await database["concept_edges"].insert_one(cycle_edge)

        # Invalidate cache so we compute with cycle
        from app.services.study_path_service import invalidate_user_study_cache
        await invalidate_user_study_cache(user_a_id)

        cycle_resp = await client.get(f"{BASE_URL}/study-paths/path/distributed_state_machine?refresh=true", headers=headers_a)
        assert cycle_resp.status_code == 200, cycle_resp.text
        cycle_data = cycle_resp.json()

        assert cycle_data["has_cycle"] is True, "Cycle was not detected!"
        assert len(cycle_data["cycle_warnings"]) > 0, "No cycle warning generated!"
        print(f"   [INFO] Cycle warning captured: {cycle_data['cycle_warnings'][0]}")

        # Ensure all 3 nodes are still returned in a valid linear order without crash or hang
        assert len(cycle_data["steps"]) == 3
        print("   [PASS] Cycle detected, back-edge broken, and linear study path returned safely.")

        # Remove the intentional cycle edge for remaining tests
        await database["concept_edges"].delete_one({"_id": cycle_edge["_id"]})

        # 5. Test "What am I missing?" Gap Analysis
        print("\n5. Testing Gap Analysis ('What am I missing?')...")
        # Initially 0 known
        gap1_resp = await client.get(f"{BASE_URL}/study-paths/gap-analysis/distributed_state_machine?refresh=true", headers=headers_a)
        assert gap1_resp.status_code == 200
        gap1 = gap1_resp.json()
        assert gap1["total_prerequisites"] == 3
        assert gap1["known_count"] == 0
        assert gap1["missing_count"] == 3
        assert gap1["readiness_percentage"] == 0.0
        assert len(gap1["missing_prerequisites"]) == 3
        print(f"   [PASS] Initial gap analysis: 0/{gap1['total_prerequisites']} known (0.0% readiness).")

        # Mark 'leader_election' as known
        print("   Marking 'leader_election' as known...")
        mark_res = await client.post(f"{BASE_URL}/study-paths/known-concepts/leader_election", headers=headers_a)
        assert mark_res.status_code == 200
        assert mark_res.json()["is_known"] is True

        gap2_resp = await client.get(f"{BASE_URL}/study-paths/gap-analysis/distributed_state_machine", headers=headers_a)
        assert gap2_resp.status_code == 200
        gap2 = gap2_resp.json()
        assert gap2["known_count"] == 1
        assert gap2["missing_count"] == 2
        assert gap2["readiness_percentage"] == 33.3
        assert gap2["known_prerequisites"][0]["concept_id"] == "leader_election"
        missing_ids = [m["concept_id"] for m in gap2["missing_prerequisites"]]
        assert missing_ids == ["raft_consensus", "distributed_state_machine"]
        print(f"   [PASS] Updated gap analysis: 1/3 known (33.3% readiness), missing: {missing_ids}.")

        # 6. Test Known Concepts List and Unmark
        print("\n6. Testing Known Concepts List & Unmark Toggle...")
        list_known = await client.get(f"{BASE_URL}/study-paths/known-concepts", headers=headers_a)
        assert list_known.status_code == 200
        assert "leader_election" in list_known.json()

        unmark_res = await client.delete(f"{BASE_URL}/study-paths/known-concepts/leader_election", headers=headers_a)
        assert unmark_res.status_code == 200
        assert unmark_res.json()["is_known"] is False

        list_known2 = await client.get(f"{BASE_URL}/study-paths/known-concepts", headers=headers_a)
        assert "leader_election" not in list_known2.json()
        print("   [PASS] Known concept toggle and listing verified.")

        # 7. Test Concept Graph Network Endpoint (vis.js/Cytoscape format)
        print("\n7. Testing Full Concept Network Graph Endpoint...")
        graph_resp = await client.get(f"{BASE_URL}/study-paths/graph", headers=headers_a)
        assert graph_resp.status_code == 200
        g_data = graph_resp.json()
        assert len(g_data["nodes"]) >= 3
        assert len(g_data["edges"]) >= 2
        assert g_data["stats"]["total_prerequisite_edges"] >= 2
        print(f"   [PASS] Network graph returned with {len(g_data['nodes'])} nodes and {len(g_data['edges'])} edges.")

        # 8. Test Hybrid Related Content Engine (Cross-linking Note & Document via Concepts)
        print("\n8. Testing Hybrid Related Content Engine (Cross-linking)...")
        # Create a Note mentioning Raft Consensus
        note_res = await client.post(f"{BASE_URL}/notes/", json={
            "title": "Study Note on Raft Consensus",
            "content": "Raft is a consensus algorithm that is designed to be easy to understand."
        }, headers=headers_a)
        assert note_res.status_code == 200
        note_id = note_res.json()["id"]

        # Add explicit mentions to link note and a doc
        dummy_doc_id = str(ObjectId())
        await database["concept_mentions"].insert_one({
            "owner_id": user_a_id,
            "concept_name": "Raft Consensus",
            "normalized_name": "raft_consensus",
            "source_id": note_id,
            "source_type": "note"
        })
        await database["concept_mentions"].insert_one({
            "owner_id": user_a_id,
            "concept_name": "Raft Consensus",
            "normalized_name": "raft_consensus",
            "source_id": dummy_doc_id,
            "source_type": "document"
        })
        await database["documents"].insert_one({
            "_id": ObjectId(dummy_doc_id),
            "owner_id": user_a_id,
            "filename": "Distributed_Systems_Lecture.pdf",
            "file_size_bytes": 1024,
            "page_count": 5,
            "file_sha256": "fake_sha_for_related_test",
            "status": "ready"
        })

        rel_resp = await client.get(f"{BASE_URL}/notes/{note_id}/related_content", headers=headers_a)
        assert rel_resp.status_code == 200
        rel_data = rel_resp.json()
        assert len(rel_data["items"]) >= 1
        top_item = rel_data["items"][0]
        assert top_item["id"] == dummy_doc_id
        assert "Raft Consensus" in top_item["shared_concepts"]
        assert "Shares concept(s)" in top_item["similarity_reason"]
        print(f"   [PASS] Note linked to Document through shared concept 'Raft Consensus' with reason: {top_item['similarity_reason']}.")

        # 9. Test Strict Two-User Isolation
        print("\n9. Testing Strict Two-User Isolation across Phase D endpoints...")
        # User B cannot see User A's study path
        b_path = await client.get(f"{BASE_URL}/study-paths/path/distributed_state_machine", headers=headers_b)
        assert b_path.status_code == 404, "Security violation: User B accessed User A's study path!"

        # User B cannot see User A's gap analysis
        b_gap = await client.get(f"{BASE_URL}/study-paths/gap-analysis/distributed_state_machine", headers=headers_b)
        assert b_gap.status_code == 404, "Security violation: User B accessed User A's gap analysis!"

        # User B graph must be empty
        b_graph = await client.get(f"{BASE_URL}/study-paths/graph", headers=headers_b)
        assert b_graph.status_code == 200
        assert len(b_graph.json()["nodes"]) == 0
        assert len(b_graph.json()["edges"]) == 0

        # User B cannot query related content of User A's note
        b_rel = await client.get(f"{BASE_URL}/notes/{note_id}/related_content", headers=headers_b)
        assert b_rel.status_code == 404, "Security violation: User B accessed User A's note related content!"
        print("   [PASS] Complete two-user isolation verified across all Phase D endpoints.")

        # Cleanup
        await client.delete(f"{BASE_URL}/notes/{note_id}", headers=headers_a)
        await database["documents"].delete_one({"_id": ObjectId(dummy_doc_id)})
        await database["concepts"].delete_many({"owner_id": {"$in": [user_a_id, user_b_id]}})
        await database["concept_edges"].delete_many({"owner_id": {"$in": [user_a_id, user_b_id]}})
        await database["concept_mentions"].delete_many({"owner_id": {"$in": [user_a_id, user_b_id]}})

    m_client.close()
    print("\n==================================================================")
    print("ALL PHASE D STUDY PATH & GRAPH ALGORITHMS TESTS PASSED!")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(run_phase_d_tests())
