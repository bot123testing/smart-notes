# Study Path Builder: Viva Demonstration & Evaluation Guide

> **Core Academic Defense Thesis:**
> *"Each database answers a question the others cannot answer well."*
> - **MongoDB:** Flexible source of truth for unstructured documents, sliding-window chunk provenance, and user progress.
> - **Neo4j:** Native transitive prerequisite graph traversal, topological sorting, and cycle-breaking algorithms.
> - **Elasticsearch:** Inverted index for typo-tolerant BM25 text search and `more_like_this` cross-document similarity.
> - **Redis:** Sub-millisecond ephemeral caching for complex study paths/graphs, worker lease locks, and token-bucket rate throttling.

---

## 1. Quick Start & Environment Verification

### Prerequisites (Native Windows Services)
Make sure the native Windows database services are active:
- **MongoDB:** `localhost:27017`
- **Redis:** `localhost:6379`
- **Elasticsearch:** `localhost:9200`
- **Neo4j Desktop:** `localhost:7474` (HTTP) / `bolt://localhost:7687`

### Starting the Applications
Open two terminals in `c:\Users\aryan\Desktop\NoSQL_Assignment\notes`:

**Terminal 1 (Backend - FastAPI):**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --port 8000 --reload
```
*Expected Startup Log:*
```
[Namespace Guard] DATABASE_NAME: smartnotes_studypath
[Namespace Guard] ES_INDEX_PREFIX: 'studypath_'
[Namespace Guard] REDIS_KEY_PREFIX: 'sp:'
[Namespace Guard] NEO4J_LABEL_PREFIX: 'SP_'
[Namespace Guard] Validation passed: running in isolated namespace.
Connected to MongoDB at mongodb://127.0.0.1:27017
Connected to Redis
```

**Terminal 2 (Frontend - Next.js):**
```powershell
cd web
npm run dev
```
*Access in browser:* `http://localhost:3000`

---

## 2. One-Command Automated Smoke Test & Demo Seeder

Before presenting to the faculty panel, run the automated suite to seed realistic data and verify end-to-end functionality.

### A. Seed Demo Knowledge Base
```powershell
cd backend
python scripts/seed_demo.py
```
*What this does:*
1. Creates the evaluation user: `demo@studypath.io` / `demopass123`.
2. Seeds 3 real PDF documents:
   - `Distributed_Consensus_Raft.pdf`
   - `CAP_Theorem_and_Consistency.pdf`
   - `Redis_Internal_Architecture.pdf`
3. Seeds 2 text notes:
   - `Byzantine Fault Tolerance and Quorums`
   - `Memory Hierarchies and In-Memory Caching`
4. Extracts and links concepts across PDFs and Notes:
   - `Leader Election` ➔ `Raft Consensus` ➔ `Distributed State Machine`
   - `Network Partition` ➔ `CAP Theorem` ➔ `Linearizability`
   - `In-Memory Caching` ➔ `Redis Data Structures` ➔ `AOF Persistence`
   - `Quorum Consensus` ➔ `Paxos` ➔ `Byzantine Fault Tolerance`
5. Sets foundational known concepts: `Leader Election`, `Network Partition`, `In-Memory Caching`.

### B. Run the Pre-Demo Smoke Test
```powershell
python scripts/smoke_test.py
```
*Expected Output:*
```
+--------------------------------------+------------------+----------+----------------------------------------------------+
| Smoke Test Check                     | Target Store     | Result   | Verification Evidence                              |
+--------------------------------------+------------------+----------+----------------------------------------------------+
| 1. Namespace Guard                   | Config           | [PASS]   | Isolated DB 'smartnotes_studypath' confirmed       |
| 2. MongoDB Store                     | MongoDB          | [PASS]   | Ping 1.0 OK on native port 27017                   |
| 3. PDF Streaming Upload              | MongoDB / FS     | [PASS]   | Magic bytes verified, doc uploaded                 |
| 4. Upload Deduplication              | MongoDB          | [PASS]   | HTTP 409 Conflict on identical SHA-256             |
| 5. Chunking & Provenance             | MongoDB          | [PASS]   | Chunks indexed with SHA-256 hash                   |
| 6. Topological Study Path            | Neo4j / Mongo    | [PASS]   | Order: leader_election -> raft -> state_machine    |
| 7. Cycle Detection & Breaking        | Algorithm        | [PASS]   | Detected cycle & safely broke back-edge            |
| 8. Gap Analysis ('What Am I Missing?') | Mongo / Logic    | [PASS]   | Readiness: 33.3% (1 known, 2 missing)              |
| 9. Cross-Source Linking (PDF <-> Note) | Neo4j / ES       | [PASS]   | Linked to 'smoke_raft_paper.pdf' via shared concept|
| 10. Strict Two-User Isolation        | Security         | [PASS]   | User B receives 404 for all User A entities        |
| 11. Redis Fast-Path Cache            | Redis            | [PASS]   | Served cached response in 6.3ms                    |
| 12. Cascade Deletion                 | MongoDB          | [PASS]   | Document, chunks, and provenance fully erased      |
+--------------------------------------+------------------+----------+----------------------------------------------------+
>>> ALL 12 SMOKE CHECKS PASSED: SYSTEM FULLY READY FOR DEMO DEFENSE! <<<
```

---

## 3. Step-by-Step Viva Live Demonstration

### Part 1: Login & Navigation
1. Navigate to `http://localhost:3000/login`.
2. Login with `demo@studypath.io` / `demopass123`.
3. Highlight the top navigation bar with 5 primary modes:
   - 📝 **Notes** (`/`)
   - 📚 **PDF Documents** (`/documents`)
   - 🗺️ **Study Paths** (`/study-path`)
   - 🧠 **Concept Graph** (`/concept-graph`)
   - 📊 **Analytics** (`/analytics`)

---

### Part 2: MongoDB in Action — Document & Sliding-Window Ingestion
**Question only MongoDB answers well:** *"How do we store semi-structured documents, variable sliding-window chunk offsets, and audit provenance with high schema flexibility?"*

1. Open `http://localhost:3000/documents`.
2. Observe the 3 seeded textbook PDFs with page counts, chunk counts, and SHA-256 fingerprints.
3. Click **"Inspect"** on `Distributed_Consensus_Raft.pdf`:
   - **Concepts Tab:** Show the extracted technical concepts (`Leader Election`, `Raft Consensus`, `Distributed State Machine`).
   - **Chunks Tab:** Show the sliding-window chunking (400 words, 80-word overlap, content hash).
   - **Related Content Tab:** Show how it automatically links to the typed note `Byzantine Fault Tolerance and Quorums` through the shared concept `Raft Consensus`.
4. Click **"File"** to download the original PDF stream directly via `GET /api/documents/{id}/file`.
5. **MongoDB Compass Verification:**
   - Database: `smartnotes_studypath`
   - Inspect collections: `documents`, `chunks`, `concepts`, `concept_mentions`, `concept_edges`.

---

### Part 3: Neo4j in Action — Topological Study Paths & Cycle Breaking
**Question only Neo4j answers well:** *"Given a target concept, what is the exact ordered chain of prerequisites to learn first, and how do we traverse multi-hop paths without quadratic SQL joins?"*

1. Open `http://localhost:3000/study-path`.
2. In the target dropdown, choose **Distributed State Machine**:
   - Show the ordered linear roadmap:
     - **Step 1:** Leader Election (Depth 0, Foundation)
     - **Step 2:** Raft Consensus (Depth 1, Intermediate)
     - **Step 3:** Distributed State Machine (Depth 2, Target)
   - Show the relations row: `Requires: [Raft Consensus]`, `Unlocks: []`.
   - Show the linked study materials (clicking them opens the exact note or PDF where this was discussed).
3. **Cycle Handling Demonstration:**
   - If a textbook contains a circular prerequisite dependency (e.g. A requires B, B requires C, C requires A):
   - The engine uses 3-color DFS to detect the back-edge, logs a visible warning banner (`"Cycle detected and broken: C -> A"`), and breaks the edge using a feedback arc set.
   - The student receives a safe, non-hanging topological order.
4. **Neo4j Browser Verification (`http://localhost:7474`):**
   ```cypher
   MATCH (c:SP_Concept {owner_id: $owner_id})
   RETURN c.name, [(c)-[:PREREQUISITE_OF]->(p) | p.name] AS unlocks
   ```

---

### Part 4: "What Am I Missing?" Gap Analysis
**Demonstrating Student Personalization:**
1. On `/study-path`, click the **"🎯 Gap Analysis ('What Am I Missing?')"** tab.
2. Observe the **Readiness Score:**
   - Shows `33.3% Readiness` because `Leader Election` is mastered, while `Raft Consensus` and `Distributed State Machine` are missing.
3. Click **"Mark Known ✓"** next to `Raft Consensus`:
   - Instantly moves to the Mastered column.
   - Readiness score immediately jumps to **66.7%**!
4. Click **"Mark Known ✓"** next to `Distributed State Machine`:
   - Readiness reaches **100%**!
   - Celebration banner appears: *"You have satisfied all prerequisites for this topic!"*

---

### Part 5: Interactive Knowledge Network (`@xyflow/react`)
1. Open `http://localhost:3000/concept-graph`.
2. Demonstrates the complete polyglot relationship view:
   - 🟣 **Concepts:** Purple pills (solid purple arrow indicates `PREREQUISITE_OF`).
   - 🟢 **Mastered Concepts:** Green glow (`is_known = True`).
   - 🔵 **PDF Documents:** Blue cards (dashed arrow indicates `MENTIONS`).
   - 🟠 **Notes:** Amber cards (dashed arrow indicates `MENTIONS`).
3. Click on any node to open the inspector sidebar and toggle mastery or generate a study path.
4. Use filter buttons (`All`, `Concepts Only`, `+ Documents`, `+ Notes`) to declutter complex graphs.

---

### Part 6: Redis in Action — Sub-Millisecond Ephemeral Caching
**Question only Redis answers well:** *"How do we deliver sub-10ms response times for expensive multi-hop graph traversals and protect Gemini API quotas?"*

1. On the Study Path or Concept Graph page, point to the green badge:
   `⚡ 6 ms (Redis fast-path)`
2. Explain the caching strategy:
   - Traversal results are cached at `sp:user:{user_id}:study_path:{concept_id}` with a 300s TTL.
   - Cache is invalidated automatically whenever a document is uploaded, deleted, or a known concept is toggled.
   - Global rate limiter (15 RPM token bucket) prevents Gemini quota exhaustion.

---

### Part 7: Elasticsearch in Action — Typo-Tolerant Multi-Field Search
**Question only Elasticsearch answers well:** *"How do we search across millions of words with typo tolerance, fuzzy matching, and BM25 relevance scoring?"*

1. Open `http://localhost:3000/`.
2. In the search bar, type a misspelled query: `"byzantin"` or `"konsensus"`.
3. Instant results appear with highlighted snippets!
4. Show the scoring weights: `title^2`, `content`, `tags^1.5`.

---

## 4. Fault Tolerance & Graceful Degradation Demo

Faculty panels love testing what happens when a dependency goes down. Smart Notes+ is architected for **zero single points of failure**:

| Failure Scenario | App Behavior | Fallback Mechanism |
| :--- | :--- | :--- |
| **Elasticsearch Down** | Search still works | Automatically falls back to MongoDB regex search (`$or: [title, content, tags]`). UI shows data without crashing. |
| **Neo4j Down** | Graph & Study Paths still work | Authoritative provenance in MongoDB `concept_edges` powers in-memory DFS topological sort. |
| **Redis Down** | All endpoints still respond | Falls back to direct database execution with transparent cache bypass. |
| **Gemini API Down / Quota Exceeded** | Ingestion completes | Deterministic NLP fallback extracts top TF-IDF keywords and heuristic prerequisites without stalling. |

---

## 5. Intentional Consistency Drift & Rebuild Demonstration

To demonstrate data consistency in the viva:

### Step 1: Run Consistency Audit (All PASS)
```powershell
python scripts/consistency_check.py
```
*Result:* All entity counts match across MongoDB, Elasticsearch, and Neo4j (`PASS`).

### Step 2: Inject Deliberate Drift
```powershell
python scripts/consistency_check.py --break-es
```
*Result:* Deletes an Elasticsearch document. The audit catches the discrepancy:
```
| Notes | 6 | 5 | 6 | FAIL (DRIFT) |
>>> OVERALL AUDIT: [FAIL] DISCREPANCY DETECTED! <<<
Run `python scripts/rebuild.py` to restore consistency from MongoDB.
```

### Step 3: Run Rebuild Script
```powershell
python scripts/rebuild.py
```
*Result:* MongoDB's authoritative truth wipes and repopulates Elasticsearch, Neo4j, and Redis read models.

### Step 4: Re-verify Consistency
```powershell
python scripts/consistency_check.py
```
*Result:* All rows return to `[PASS]`!
