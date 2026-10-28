# Smart Notes+ Reviewer Demonstration Script & Cheat-Sheet
## Complete Guide: Where to Access, What to Click, and Exact Terminal Queries to Run

---

## 1. Quick Access Directory (URLs & Credentials)

| Service / Interface | URL / Access Method | Credentials / Details | Purpose for Reviewer |
| :--- | :--- | :--- | :--- |
| **Web Application** | [`http://localhost:3000`](http://localhost:3000) | **Email:** `demo@studypath.io`<br>**Password:** `demopass123` | Main user interface (Notes, PDFs, Study Paths, Graphs). |
| **PDF & Notes Reader** | [`http://localhost:3000/`](http://localhost:3000/) | Authenticated session | View unified notes, PDF reader, chunking & passage highlights. |
| **Study Path Stepper** | [`http://localhost:3000/study-path`](http://localhost:3000/study-path) | Authenticated session | Step-by-step prerequisite roadmap & gap analysis. |
| **Concept Graph** | [`http://localhost:3000/concept-graph`](http://localhost:3000/concept-graph) | Authenticated session | Interactive 2D physics network of concepts, notes, and PDFs. |
| **Neo4j Browser GUI** | [`http://localhost:7474`](http://localhost:7474) | **User:** `neo4j`<br>**Password:** `password` | Visual Cypher graph queries and relationship traversals. |
| **MongoDB Shell / Compass**| `mongodb://localhost:27017` | Database: `smartnotes_studypath` | Inspect BSON documents, chunk provenance, and user mastery. |
| **FastAPI Swagger Docs**| [`http://localhost:8000/docs`](http://localhost:8000/docs) | N/A | Interactive REST API documentation and endpoints. |

---

## 2. Startup Commands (Run Before the Presentation)

Open two PowerShell windows:

### Terminal 1 (Backend - FastAPI):
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
.\venv\Scripts\uvicorn.exe main:app --port 8000 --reload
```
*Expected confirmation log:*
```text
[Namespace Guard] DATABASE_NAME: smartnotes_studypath
[Namespace Guard] Validation passed: running in isolated namespace.
Connected to MongoDB at mongodb://127.0.0.1:27017
Connected to Redis
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2 (Frontend - Next.js):
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\web
npm run dev
```
*Expected confirmation log:*
```text
▲ Next.js 16.1.1 (Turbopack)
- Local:   http://localhost:3000
✓ Ready in 1.4s
```

*(Optional) If you want to seed fresh demo data before the viva:*
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
.\venv\Scripts\python.exe scripts/seed_demo.py
```

---

## 3. Database-by-Database Reviewer Demonstration (Live Code & Outputs)

Walk through these sections to prove each NoSQL database live.

> **💡 Quickest Way to Prove Both MongoDB & Redis at Once in Normal Terminal:**  
> Run our built-in inspector script directly in PowerShell/cmd:
> ```powershell
> cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
> .\venv\Scripts\python.exe scripts/inspect_db.py
> ```
> *(Instantly prints all active MongoDB collections, record counts, sliding-window chunk provenance, and live Redis `sp:*` cache keys!)*

---

### Database 1: MongoDB (Document Model — Port 27017)

#### A. Academic Defense (What to Say):
> *"MongoDB is our authoritative source of truth. Lecture notes and PDFs are semi-structured—they have varying tags, dynamic page numbers, variable-length text chunks, and bounding-box offsets. In SQL, this requires 6+ normalized tables with complex JOINs. In MongoDB, it is natively stored as nested BSON documents."*

#### B. How to Inspect Live in Front of Reviewer:
* **Option 1 (Visual GUI — Recommended):**
  1. Open **MongoDB Compass** from the Windows Start menu.
  2. Click **Connect** (default `mongodb://localhost:27017`).
  3. Click on database **`smartnotes_studypath`**.
  4. Show collections: `documents`, `chunks`, `concepts`, `concept_mentions`, and `user_known_concepts`.

* **Option 2 (Terminal Command Line):**
  In PowerShell, run this one-liner:
  ```powershell
  .\venv\Scripts\python.exe -c "import pymongo, pprint; db = pymongo.MongoClient('mongodb://localhost:27017')['smartnotes_studypath']; pprint.pprint(list(db.documents.find({}, {'filename': 1, 'tags': 1, 'chunk_count': 1})))"
  ```

#### C. Expected Output to Show Reviewer:
* Clean BSON records showing nested arrays: `tags: ["#cloud", "#virtualization"]`, `extracted_concepts: ["virtual_machines", "containerization"]`, and SHA-256 content hashes.

#### D. Live Web UI Action:
1. Go to `http://localhost:3000`.
2. Click **"Cloud Computing and Virtualization.pdf"**.
3. Under the **TAGS** section, type `#nosql-viva` and press `Enter`.
4. Run `db.documents.find({tags: '#nosql-viva'}, {filename: 1, tags: 1})` in `mongosh`—show the reviewer that the tag persisted to MongoDB in real time!

---

### Database 2: Redis (In-Memory Key-Value Model — Port 6379)

#### A. Academic Defense (What to Say):
> *"Topological prerequisite traversals and cycle-breaking algorithms are CPU-heavy ($O(V + E)$). Running this on every page view degrades database performance. Redis caches precomputed learning paths directly in RAM with a 300-second TTL, giving sub-10ms response times. Redis also manages our token-bucket rate limiter (15 RPM) to protect Google Gemini AI quotas."*

#### B. Terminal Code to Run in Front of Reviewer:
* **Option 1 (Using the exact redis-cli path):**  
  In PowerShell, run:
  ```powershell
  & "C:\Program Files\Redis\redis-cli.exe"
  ```
  *(Or in Command Prompt: `"C:\Program Files\Redis\redis-cli.exe"`)*

  Once inside the `127.0.0.1:6379>` prompt, run:
  ```text
  # 1. View all active keys under the studypath namespace prefix
  KEYS sp:*

  # 2. Check the TTL countdown (Time-To-Live in seconds) of a cached study path
  TTL sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923

  # 3. Read the cached precomputed JSON payload directly from RAM
  GET sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923

  # 4. Show Redis memory statistics
  INFO memory
  ```

* **Option 2 (Using Python one-liner in terminal):**
  ```powershell
  .\venv\Scripts\python.exe -c "import redis; r = redis.Redis(port=6379, protocol=2); print('Active Keys:', r.keys('sp:*'))"
  ```

#### C. Expected Output to Show Reviewer:
* `KEYS sp:*` returns keys like `sp:studypath:path:raft_consensus:...` and `sp:studypath:graph:...`.
* `TTL` returns an integer countdown (e.g. `274` seconds remaining before automatic eviction).
* `GET` outputs the full JSON study path containing ordered steps.

#### D. Live Web UI Action:
1. Open [`http://localhost:3000/study-path`](http://localhost:3000/study-path).
2. Select target concept: **Raft Consensus**.
3. Point to the green pill badge at the top right:
   **`⚡ 6 ms (Redis fast-path)`** or **`⚡ 11 ms (Redis fast-path)`**.
4. **What to tell reviewer:** *"Notice the response latency is 6 milliseconds. This proves that disk I/O was completely bypassed and the payload was served directly from Redis RAM."*

---

### Database 3: Neo4j (Labeled Property Graph — Port 7687 / 7474)

#### A. Academic Defense (What to Say):
> *"Prerequisites form a directed graph. In relational SQL or document stores, finding prerequisite chains 5 to 10 hops deep requires recursive joins or recursive `$graphLookup` pipelines that degrade exponentially ($O(N \log N)$). Neo4j uses **Native Index-Free Adjacency**, where each node contains physical memory pointers to its neighbors. Traversing multi-hop paths is an $O(k)$ pointer-hopping operation that runs in microseconds."*

#### B. Cypher Queries to Run in Neo4j Browser (`http://localhost:7474`):
Open your browser to [`http://localhost:7474`](http://localhost:7474), log in with `neo4j` / `password`, and run these queries:

```cypher
// 1. Comprehensive Multi-Model Knowledge Graph (MOST DETAILED GRAPH VIEW)
// Renders all Notes, Documents, and Concepts interconnected by all relationships in one rich visual web!
MATCH (n)-[r]->(m) 
RETURN n, r, m;

// 2. Transitive Prerequisite Hierarchy Chains (Arbitrary-Depth Traversal 1..10 hops)
// Demonstrates native index-free adjacency: renders clear directional learning roadmaps from foundational to advanced concepts
MATCH path = (prereq:SP_Concept)-[:PREREQUISITE_OF*1..10]->(target:SP_Concept)
RETURN path;

// Bonus (Targeted Concept): Transitive traversal specifically leading up to Raft Consensus
MATCH path = (prereq:SP_Concept)-[:PREREQUISITE_OF*1..10]->(target:SP_Concept {id: "raft_consensus"})
RETURN path;
```

#### C. Expected Output to Show Reviewer:
* Neo4j's visual graph canvas renders colored circular nodes connected by arrows (`PREREQUISITE_OF` and `MENTIONS`).

#### D. Live Web UI Action:
1. Open [`http://localhost:3000/concept-graph`](http://localhost:3000/concept-graph).
2. Show the interactive physics-based graph rendering concept nodes, notes, and documents.
3. Click any node (e.g. `Raft Consensus`): show the sidebar light up with connected materials and prerequisites.

---

### Database 4: Elasticsearch (BM25 Inverted Index — Port 9200)

#### A. Academic Defense (What to Say):
> *"SQL `LIKE %...%` and MongoDB regex searches execute full table scans. They cannot rank search results by relevance, and they fail completely if the user makes a typo. Elasticsearch maintains an **Inverted Index** with BM25 probabilistic relevance ranking, multi-field weighted scoring (`title^3`, `tags^2`, `content`), and typo tolerance using Levenshtein distance."*

#### B. How to Start and Query in Front of Reviewer:
* **Start Elasticsearch (PowerShell Terminal):**
  ```powershell
  cd C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5\bin
  .\elasticsearch.bat
  ```
  *(Verify in browser: open `http://localhost:9200` to see the JSON cluster banner).*

* **Query from Terminal (PowerShell):**
  ```powershell
  # 1. View indices and document counts:
  curl.exe "http://localhost:9200/_cat/indices?v"

  # 2. Test Typo-Tolerant Search for misspelled query "consensuz":
  curl.exe "http://localhost:9200/studypath_notes/_search?q=consensuz~1"
  ```

#### C. Expected Output to Show Reviewer:
* Shows `studypath_notes` and `studypath_documents` indices with doc counts.
* The search query matches the note `"Byzantine Fault Tolerance and Quorums"` with BM25 score (`_score: 0.847`) despite the spelling mistake!

> **💡 Even Easier:** Run the built-in inspector:  
> `.\venv\Scripts\python.exe scripts/inspect_db.py`  
> *(Directly displays MongoDB, Redis, and Elasticsearch test queries with zero syntax errors).*

#### D. Live Web UI Action & Graceful Fallback Proof:
1. In the search bar on the left of `http://localhost:3000`, type misspelled words like `"consensuz"` or `"virtulizashun"`.
2. Matching notes and PDFs appear immediately!
3. **Resilience Defense:** If Elasticsearch is not running, point to your backend terminal log:
   `ElasticSearch unavailable — search will fall back to MongoDB.`
   Explain: *"Our architecture guarantees Zero Single-Point-of-Failure. If Elasticsearch goes offline, search queries automatically fall back to MongoDB regex search with zero application downtime!"*

---

## 4. Live Web UI Walkthrough (What to Click on Screen)

Follow this 5-minute flow to demonstrate all features:

```
Step 1: Unified Feed (Notes + PDFs)
  └─> Step 2: High-Quality Concept Extraction (Domain Ontology)
        └─> Step 3: Passage Deep-Linking & Glowing Highlighting
              └─> Step 4: AI Magic Tags
                    └─> Step 5: Topological Study Path & Cycle Breaking
                          └─> Step 6: Gap Analysis ("What Am I Missing?")
```

### Step 1: Show the Unified Knowledge Base (`/`)
* **Where:** `http://localhost:3000`
* **What to show:**
  * Point to the left sidebar: Text notes (`📝 NOTE`) and uploaded PDF documents (`📄 PDF`) live side-by-side in one unified list.
  * Show tags, page counts, word counts, and timestamps.

### Step 2: High-Quality Concept Extraction (Domain Ontology)
* **Where:** Click **"Cloud Computing and Virtualization.pdf"** in the sidebar.
* **What to click:** Click the **"Extracted Concepts"** sub-tab.
* **What to show:**
  * Clean, multi-word technical concepts: *Infrastructure as a Service (IaaS)*, *Platform as a Service (PaaS)*, *Virtual Machines*, *Containerization*, *Cloud Computing*, *Virtualization*.
  * **What to say:** *"Notice that noisy single-word filler tokens like 'Their', 'Modern', and 'Transformed' are eliminated by our domain knowledge ontology filter."*

### Step 3: Direct Passage Highlighting from Concept Cards
* **What to click:** On the `Cloud Computing` concept card, click the **"🔍 In Text"** button.
* **What happens live:**
  1. The viewer automatically switches to the **Text Chunks** tab.
  2. Displays the banner: `🎯 Focusing on Concept: "Cloud Computing"`.
  3. Scrolls directly to the relevant chunk.
  4. The chunk card highlights with a cyan border, and occurrences of the concept glow in luminous amber `<mark>` tags!

### Step 4: AI Magic Tags
* **What to click:** In the PDF header, point to the **TAGS** section.
* Click the **"Magic Tags"** sparkle button.
* **What to show:** AI reads the text chunks and generates relevant tags (`#cloud-computing`, `#virtualization`, `#containers`) and saves them to MongoDB.

### Step 5: Study Path Builder (`/study-path`)
* **Where:** Click **Study Paths** in the top navigation.
* Select target: **Raft Consensus** (or **Distributed State Machine**).
* **What to show:**
  * **Topological Sequence:**
    * Step 1: `Leader Election` (Foundational)
    * Step 2: `Raft Consensus` (Intermediate)
    * Step 3: `Distributed State Machine` (Advanced)
  * Click the **"📖 Study in PDF →"** button on any card: the app deep-links directly back into the PDF reader, opens the chunk tab, and highlights the passage!

### Step 6: Gap Analysis ("What Am I Missing?")
* **Where:** On `/study-path`, click the **"🎯 Gap Analysis ('What Am I Missing?')"** tab.
* **What to show:**
  * The **Readiness Score** circle (e.g. `33%` or `50%`).
  * Click **"Mark Mastered ✓"** on a missing prerequisite: show how the readiness score jumps instantly (e.g. to `67%` or `100%`) and the concept moves from *Missing* to *Mastered*!

---

## 5. One-Command 12-Check Formal Verification Suite

If the reviewer asks for proof that all backend operations pass verification, run this single script:

```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
.\venv\Scripts\python.exe scripts/smoke_test.py
```

### Expected Output Table to Show Reviewer:
```text
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
| 9. Cross-Source Linking (PDF <-> Note) | Neo4j / ES       | [PASS]   | Linked to PDF via shared concept                   |
| 10. Strict Two-User Isolation        | Security         | [PASS]   | User B receives 404 for all User A entities        |
| 11. Redis Fast-Path Cache            | Redis            | [PASS]   | Served cached response in 6.3ms                    |
| 12. Cascade Deletion                 | MongoDB          | [PASS]   | Document, chunks, and provenance fully erased      |
+--------------------------------------+------------------+----------+----------------------------------------------------+
>>> ALL 12 SMOKE CHECKS PASSED: SYSTEM FULLY READY FOR DEMO DEFENSE! <<<
```

---

## 6. Top 3 Reviewer Questions & Quick Answers

### Q1: Why didn't you just use MongoDB for everything?
> **Answer:** *"MongoDB is our authoritative transactional document store, but multi-hop graph traversals 5 to 10 levels deep require recursive `$graphLookup` pipelines that degrade exponentially ($O(N \log N)$). Neo4j uses native index-free adjacency ($O(k)$ pointer-hopping in microseconds). In addition, MongoDB regex performs full table scans without the BM25 probabilistic relevance ranking or typo tolerance provided by Elasticsearch."*

### Q2: How do you prevent data inconsistency across 4 databases (The Dual-Write Problem)?
> **Answer:** *"We use the **Authoritative Source of Truth Pattern**: MongoDB is the sole transactional authority. All notes, PDFs, and concepts commit to MongoDB first. Elasticsearch, Neo4j, and Redis are derived read models. If a write to Neo4j fails, the transaction does not abort; the entity is safe in MongoDB, and our background reconciliation script (`rebuild.py`) can rebuild Neo4j and Elasticsearch directly from MongoDB provenance at any time."*

### Q3: How do you handle circular prerequisite dependencies?
> **Answer:** *"Human notes and textbooks often have cycles ($A \rightarrow B \rightarrow C \rightarrow A$). Before generating any roadmap, our backend runs a **3-color Depth-First Search (DFS) cycle-detection algorithm**. When a back-edge is detected, the engine isolates it, breaks it using a feedback arc set, notifies the user with a warning banner, and runs Kahn's topological sort to guarantee a cycle-safe learning roadmap."*
