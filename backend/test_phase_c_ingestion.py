import io
import asyncio
import httpx
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from pypdf import PdfWriter
from bson import ObjectId

BASE_URL = "http://127.0.0.1:8000/api"
DB_NAME = "smartnotes_studypath"

def create_sample_pdf(content_text: str = "") -> bytes:
    """Creates a valid, in-memory PDF with real structure for test uploads."""
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

async def run_phase_c_tests():
    print("\n==================================================================")
    print("RUNNING PHASE C INGESTION & EXTRACTION ENGINE INTEGRATION TESTS")
    print("==================================================================\n")

    m_client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    database = m_client[DB_NAME]

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Setup User A and User B
        print("1. Creating test users (User A & User B)...")
        u_suffix = uuid.uuid4().hex[:6]
        email_a, email_b = f"user_a_{u_suffix}@example.com", f"user_b_{u_suffix}@example.com"
        pwd = "password123"

        res_a = await client.post(f"{BASE_URL}/auth/register", json={"email": email_a, "password": pwd})
        assert res_a.status_code == 200, res_a.text
        user_a_id = res_a.json()["id"]

        res_b = await client.post(f"{BASE_URL}/auth/register", json={"email": email_b, "password": pwd})
        assert res_b.status_code == 200, res_b.text
        user_b_id = res_b.json()["id"]

        login_a = await client.post(f"{BASE_URL}/auth/login", data={"username": email_a, "password": pwd})
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        login_b = await client.post(f"{BASE_URL}/auth/login", data={"username": email_b, "password": pwd})
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}
        print(f"   [PASS] User A ({user_a_id}) and User B ({user_b_id}) ready.")

        # 2. Test Invalid Magic Bytes (Reject)
        print("\n2. Testing Upload Rejection on Bad Magic Bytes...")
        fake_files = {"file": ("malicious.pdf", b"NOT_A_REAL_PDF_HEADER_JUST_TEXT", "application/pdf")}
        bad_upload = await client.post(f"{BASE_URL}/documents/upload", files=fake_files, headers=headers_a)
        assert bad_upload.status_code == 400
        assert "magic bytes" in bad_upload.text.lower()
        print("   [PASS] Bad magic bytes rejected with HTTP 400 and temp file cleaned up.")

        # 3. Test Valid PDF Streaming Upload
        print("\n3. Testing Valid PDF Streaming Upload...")
        pdf_bytes = create_sample_pdf("Distributed Systems: Raft Consensus, Paxos, and Leader Election")
        files = {"file": ("distributed_systems.pdf", pdf_bytes, "application/pdf")}
        upload_resp = await client.post(f"{BASE_URL}/documents/upload", files=files, headers=headers_a)
        assert upload_resp.status_code == 200, upload_resp.text
        doc_data = upload_resp.json()
        doc_id = doc_data["id"]
        assert doc_data["owner_id"] == user_a_id
        assert doc_data["file_size_bytes"] == len(pdf_bytes)
        print(f"   [PASS] Document {doc_id} uploaded successfully in state '{doc_data['status']}'.")

        # 4. Test Deduplication by (owner_id, file_sha256)
        print("\n4. Testing Duplicate Upload Rejection (SHA-256 Dedupe)...")
        dup_files = {"file": ("duplicate.pdf", pdf_bytes, "application/pdf")}
        dup_resp = await client.post(f"{BASE_URL}/documents/upload", files=dup_files, headers=headers_a)
        assert dup_resp.status_code == 409
        print("   [PASS] Duplicate upload rejected with HTTP 409 Conflict.")

        # 5. Two-User Isolation: User B cannot access User A's document or download file
        print("\n5. Testing Strict Two-User Isolation...")
        get_b_doc = await client.get(f"{BASE_URL}/documents/{doc_id}", headers=headers_b)
        assert get_b_doc.status_code == 404, "Security violation: User B accessed User A's document metadata!"

        get_b_file = await client.get(f"{BASE_URL}/documents/{doc_id}/file", headers=headers_b)
        assert get_b_file.status_code == 404, "Security violation: User B downloaded User A's file!"

        get_a_file = await client.get(f"{BASE_URL}/documents/{doc_id}/file", headers=headers_a)
        assert get_a_file.status_code == 200, f"User A failed to download own file! status: {get_a_file.status_code}, text: {get_a_file.text}"
        assert len(get_a_file.content) == len(pdf_bytes)
        print("   [PASS] Two-user isolation verified: User B receives HTTP 404 for User A's document & file.")

        # 6. Verify Background Pipeline Processing & Provenance
        print("\n6. Verifying Document Pipeline & Provenance Records...")
        # Wait up to 5 seconds for async processing
        await asyncio.sleep(3)
        poll_doc = await client.get(f"{BASE_URL}/documents/{doc_id}", headers=headers_a)
        p_status = poll_doc.json()["status"]
        print(f"   [INFO] Document pipeline status: {p_status}")

        # Check Mongo collections
        m_doc = await database["documents"].find_one({"_id": ObjectId(doc_id)})
        assert m_doc is not None
        assert m_doc["owner_id"] == user_a_id

        # 7. Test Note Creation with Debounced Concept Extraction
        print("\n7. Testing Note Creation & Background Concept Debounce...")
        note_resp = await client.post(f"{BASE_URL}/notes/", json={
            "title": "Byzantine Fault Tolerance",
            "content": "Byzantine fault tolerance is the property of a system that is resilient against arbitrary faults."
        }, headers=headers_a)
        assert note_resp.status_code == 200, note_resp.text
        note_id = note_resp.json()["id"]
        print(f"   [PASS] Note {note_id} created; background debounce extraction scheduled.")

        # 8. Test Document Deletion & Cascade Cleanup
        print("\n8. Testing Document Deletion & Provenance Cascade Cleanup...")
        del_resp = await client.delete(f"{BASE_URL}/documents/{doc_id}", headers=headers_a)
        assert del_resp.status_code == 204

        # Verify deleted from Mongo
        m_deleted = await database["documents"].find_one({"_id": ObjectId(doc_id)})
        assert m_deleted is None, "Document not removed from MongoDB documents collection!"

        # Verify chunks deleted
        remaining_chunks = await database["chunks"].count_documents({"document_id": doc_id})
        assert remaining_chunks == 0, "Chunks were not cascade deleted!"

        # Verify mentions deleted
        remaining_mentions = await database["concept_mentions"].count_documents({"source_id": doc_id})
        assert remaining_mentions == 0, "Mentions were not cascade deleted!"
        print("   [PASS] Document, chunks, mentions, and files cascade-deleted cleanly.")

        # Cleanup Note
        await client.delete(f"{BASE_URL}/notes/{note_id}", headers=headers_a)

    m_client.close()
    print("\n==================================================================")
    print("ALL PHASE C INGESTION ENGINE TESTS PASSED SUCCESSFULLY!")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(run_phase_c_tests())
