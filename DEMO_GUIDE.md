# Smart Notes+ Study Path Builder: Complete Run & Reviewer Demonstration Guide
## Polyglot Persistence Architecture (MongoDB, Redis, Elasticsearch, Neo4j)

---

## 1. Executive Summary & Core Academic Thesis

### The Core Viva Defense Statement
> **"Each database answers a question the others cannot answer well."**
> 
> Rather than forcing a single database to handle everything, **Smart Notes+ Study Path Builder** employs a **true Polyglot Persistence architecture** where four specialized database engines work in concert:
> 
> 1. **MongoDB (Document Model — Port 27017):** The **authoritative transactional source of truth** for unstructured lecture notes, uploaded PDF metadata, 400-word sliding-window chunk offsets, raw concept provenance, and user mastery records.
> 2. **Neo4j (Labeled Property Graph — Port 7687 / 7474):** The **prerequisite graph traversal engine** implementing native index-free adjacency. Solves arbitrary-depth prerequisite hierarchies (`PREREQUISITE_OF*1..10`) and cycle-breaking topological sorting in microseconds.
> 3. **Elasticsearch (Distributed Inverted Index — Port 9200):** The **full-text search and content similarity engine**. Uses BM25 probabilistic relevance ranking, typo-tolerant fuzzy matching (Levenshtein distance), and cross-document similarity.
> 4. **Redis (In-Memory Key-Value — Port 6379):** The **sub-millisecond ephemeral cache & throttling layer**. Caches precomputed study paths, stores token-bucket rate limits (15 RPM for Gemini AI), and manages background worker lease locks.

---

## 2. System Architecture & Port Mapping

```
+----------------------------------------------------------------------------------------------------+
|                                    NEXT.JS 16 WEB FRONTEND                                         |
|  [Notes + PDFs]   [AI Magic Tags]   [Study Path Stepper]   [Gap Analysis]   [Interactive Graph]    |
+-------------------------------------------------+--------------------------------------------------+
                                                  | RESTful API (Port 8000)
+-------------------------------------------------v--------------------------------------------------+
|                                    FASTAPI BACKEND GATEWAY                                         |
|  - JWT & PBKDF2 Auth    - Sliding-Window Chunker    - Token-Bucket Limiter    - Cycle-Safe TopoSort|
|  - Namespace Guard      - Gemini 2.5 Flash Engine   - Worker Lease Manager    - Hybrid Matcher     |
+-------------------+--------------------+--------------------+--------------------+-----------------+
                    |                    |                    |                    |
         (Source of Truth)        (Graph Traversal)    (Full-Text Search)    (Ephemeral Caching)
                    |                    |                    |                    |
+-------------------v---+ +--------------v----+ +-------------v-----+ +------------v-----+
|       MONGODB         | |      NEO4J        | |   ELASTICSEARCH   | |     REDIS       |
|  Port: 27017          | |  Port: 7687/7474  | |  Port: 9200       | |  Port: 6379     |
|                       | |                   | |                   | |                 |
| - users               | | (:SP_Concept)     | | Index:            | | Prefix: sp:     |
| - notes               | | (:SP_Document)    | | studypath_notes   | | - study_path    |
| - documents           | | (:SP_Note)        | | Index:            | | - concept_graph |
| - chunks              | | -[:PREREQUISITE]- | | studypath_docs    | | - worker_lease  |
| - concepts            | | -[:MENTIONS]->    | |                   | | - token_bucket  |
| - concept_edges       | |                   | | (BM25 Inverted    | |                 |
| - concept_mentions    | | (Native Index-Free| |  Index & Fuzzy    | | (In-Memory      |
| - user_known_concepts | |  Adjacency)       | |  Token Matching)  | |  RESP2 Cache)   |
+-----------------------+ +-------------------+ +-------------------+ +-----------------+
```

---

## 3. Sequential Step-by-Step Execution Guide (In Strict Order)

Follow these steps sequentially to run the entire project from scratch.

### Step 1: Database Services Status (MongoDB & Redis are already running!)

Good news: On your machine, **MongoDB** and **Redis** are already installed as Windows background services and start **automatically** on boot. You do **not** need to start them manually!

1. **MongoDB (Port 27017):**
   - **Status:** Already running in the background!
   - You do **not** need to run `net start MongoDB` (which requires admin permissions and gives "Access is denied" if run in standard cmd).

2. **Redis (Port 6379):**
   - **Status:** Already running in the background!
   - You do **not** need to run `redis-server`.

3. **Neo4j Desktop (Port 7687 Bolt, 7474 Browser):**
   - Open the **Neo4j Desktop** app from your Windows Start Menu.
   - Click the **"Start"** button on your DBMS project to turn the status green.
   - *(If Neo4j is not started, the backend automatically uses an in-memory DFS fallback over MongoDB provenance so the app never crashes!)*

4. **Elasticsearch (Port 9200):**
   - You can simply run our 1-click shortcut script:
     ```powershell
     .\start_elasticsearch.bat
     ```
     *(Or manually: `cd C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5\bin; .\elasticsearch.bat`)*
   - Keep that command prompt window open. Note: It takes about 25–30 seconds to allocate JVM memory and bind to port 9200.
   - *(Note: `xpack.security.enabled: false` is already pre-configured in your `config/elasticsearch.yml` so it connects over standard `http://localhost:9200` without password or SSL hurdles!)*
   - *(If Elasticsearch is ever offline, the backend automatically uses a transparent MongoDB regex fallback for full-text search!)*

#### How to Verify Ports (Run this in **PowerShell**, not Command Prompt):
Open a **PowerShell** window (make sure the prompt says `PS C:\...`):
```powershell
Get-NetTCPConnection -LocalPort 27017, 6379, 9200, 7687 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, State
```
*(You will see ports `27017` and `6379` already listed as `Listen`!)*

---

### Step 2: Environment Configuration & Namespace Guard Check

Make sure your `backend/.env` file has the active isolated namespace configured:

```ini
APP_NAMESPACE_CONFIRMED="studypath"
DATABASE_NAME="smartnotes_studypath"
ES_INDEX_PREFIX="studypath_"
REDIS_KEY_PREFIX="sp:"
NEO4J_LABEL_PREFIX="SP_"

MONGODB_URL="mongodb://127.0.0.1:27017"
REDIS_URL="redis://127.0.0.1:6379/0"
ELASTICSEARCH_URL="http://127.0.0.1:9200"
NEO4J_URI="bolt://127.0.0.1:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="password"
```

> **Why the Namespace Guard matters to reviewers:**
> The backend contains an automatic safety guard. If anyone attempts to boot the application with `DATABASE_NAME=smartnotes` or an empty prefix, the backend **refuses to start**. This guarantees existing databases or older projects are never overwritten or contaminated.

---

### Step 3: Start the Backend (FastAPI on Port 8000)

Open **Terminal 1** (PowerShell):

```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend

# Run FastAPI backend with uvicorn (direct venv execution):
.\venv\Scripts\uvicorn.exe main:app --port 8000 --reload

# (Or if your venv is activated, you can run: uvicorn main:app --port 8000 --reload)
```

**Expected Startup Logs:**
```
[Namespace Guard] DATABASE_NAME: smartnotes_studypath
[Namespace Guard] ES_INDEX_PREFIX: 'studypath_'
[Namespace Guard] REDIS_KEY_PREFIX: 'sp:'
[Namespace Guard] NEO4J_LABEL_PREFIX: 'SP_'
[Namespace Guard] Validation passed: running in isolated namespace.
Connected to MongoDB at mongodb://127.0.0.1:27017
Connected to Redis
Connected to ElasticSearch: 8.x.x
Connected to Neo4j at bolt://127.0.0.1:7687
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

---

### Step 4: Start the Web Frontend (Next.js 16 on Port 3000)

Open **Terminal 2** (PowerShell):

```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\web

# Start Next.js development server
npm run dev
```

**Expected Startup Logs:**
```
▲ Next.js 16.1.1 (Turbopack)
- Local:   http://localhost:3000
✓ Ready in 1.4s
```

---

### Step 5: Access the Web Application & Demo Account

1. Open your browser and navigate to: **`http://localhost:3000`**
2. The application automatically redirects to the **Login Page**.
3. **Pre-Configured Demo Credentials:**
   - **Email:** `demo@studypath.io`
   - **Password:** `demopass123`
   *(Or click "Sign Up" to create a fresh user account).*

---

### Step 6: (Optional) Run One-Command Seeding & Formal Smoke Verification

Before your viva evaluation, you can run these two automated scripts in `backend`:

#### A. Seed Realistic Lecture Data (PDFs, Notes, Concepts & Prerequisites):
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
cmd /c "set PYTHONPATH=. && python scripts/seed_demo.py"
```
*Seeds 3 PDF textbooks/papers, 2 text notes, and extracts 8+ interconnected concepts with prerequisites (`Leader Election` ➔ `Raft Consensus` ➔ `Distributed State Machine`, `CAP Theorem`, `Redis Caching`).*

#### B. Run the 12-Check Formal Verification Suite:
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
cmd /c "set PYTHONPATH=. && python scripts/smoke_test.py"
```
*Runs 12 automated checks across all 4 databases, outputting a formal table verifying reachability, chunking, graph traversals, gap analysis, caching, and cascade deletion.*

---

## 4. How to Prove the 4 Databases to the Reviewer (Backend Deep-Dive)

When the reviewer asks:  
**"Prove to me that you actually used 4 databases in the backend, and explain why each is necessary."**  
Walk through these 4 sections:

---

### Database 1: MongoDB (Authoritative Document Store)

#### 1. Why MongoDB? (Academic Defense)
MongoDB is the **authoritative single source of truth**. Document stores excel at storing semi-structured, polymorphic data (notes with variable tags, PDF metadata, variable word-count sliding-window chunks with bounding box offsets, and student mastery logs) without rigid table migrations.

#### 2. What is Stored in MongoDB:
Database Name: `smartnotes_studypath`
- `documents`: Uploaded PDF metadata, SHA-256 fingerprints, page counts, file sizes, and user-defined tags.
- `chunks`: 400-word sliding-window segments with 80-word overlap, page numbers, and extracted concepts.
- `concepts`: Canonical technical concepts (`name`, `normalized_name`, `description`).
- `concept_mentions`: Provenance records mapping concepts to specific chunks, documents, and notes.
- `concept_edges`: Authoritative directed prerequisite edges (`from_concept` ➔ `to_concept`).
- `user_known_concepts`: Personalized student mastery toggles scoped by `owner_id`.
- `notes`: Rich-text markdown notes with tags and links.

#### 3. Live Proof Commands to Run in Front of Reviewer:
Open a terminal and run `mongosh`:
```javascript
mongosh "mongodb://localhost:27017/smartnotes_studypath"

// 1. Show all collections in the isolated namespace
show collections

// 2. Inspect ingested PDF documents and user tags
db.documents.find({}, { filename: 1, page_count: 1, chunk_count: 1, tags: 1 }).pretty()

// 3. Inspect a sliding-window text chunk with extracted concepts
db.chunks.findOne({ chunk_index: 0 }, { chunk_index: 1, text: 1, extracted_concepts: 1 })

// 4. Inspect concept provenance (shows exact text snippet where AI found the concept)
db.concept_mentions.find({}, { concept_name: 1, source_type: 1, snippet: 1 }).limit(3).pretty()

// 5. Inspect student mastery tracking
db.user_known_concepts.find()
```

#### 4. GUI Proof:
Open **MongoDB Compass** ➔ Connect to `mongodb://localhost:27017` ➔ Select `smartnotes_studypath` ➔ Show the live collections, schema tabs, and documents.

#### 5. Live UI Action:
- In the Web UI (`http://localhost:3000`), click **"Cloud Computing and Virtualization.pdf"**.
- Add a tag `#cloud-native` in the **TAGS** section and press `Enter`.
- Re-run `db.documents.find({filename: /Cloud/}, {tags: 1})` in `mongosh` to show the tag persisted immediately in MongoDB.

---

### Database 2: Redis (In-Memory Key-Value & Ephemeral Cache)

#### 1. Why Redis? (Academic Defense)
Computing multi-hop topological sorts, transitive prerequisite closures, and cycle-breaking graphs is CPU-intensive ($O(V + E)$). Running graph algorithms on every page render would overwhelm primary stores.  
Redis stores **precomputed study paths and graphs in RAM** using sub-millisecond RESP2 serialization with a 300-second TTL. It also powers the distributed token-bucket rate limiter (15 RPM) protecting Gemini API quotas.

#### 2. What is Stored in Redis:
Key Prefix: `sp:*`
- `sp:studypath:path:<concept_id>:<owner_id>`: Precomputed topologically sorted study path (JSON cached for 300s).
- `sp:studypath:graph:<owner_id>`: Serialized node-and-edge graph for instant 60 FPS rendering.
- `sp:studypath:gap:<concept_id>:<owner_id>`: Precomputed readiness score and missing prerequisite gap analysis.
- `sp:user:<user_id>:recent_notes`: Ephemeral list of recently viewed notes/documents.
- `sp:worker:lease:<document_id>`: Distributed lease lock with automatic heartbeat renewal preventing duplicate background PDF workers.

#### 3. Live Proof Commands to Run in Front of Reviewer:
* **Option 1 (Direct Redis CLI using full path):**
  Open PowerShell:
  ```powershell
  & "C:\Program Files\Redis\redis-cli.exe"
  ```
  *(Or in Command Prompt: `"C:\Program Files\Redis\redis-cli.exe"`)*

  Inside the `127.0.0.1:6379>` prompt, run:
  ```text
  # 1. View all active keys under the studypath namespace prefix
  KEYS sp:*

  # 2. Check the TTL (countdown in seconds) of a cached study path
  TTL sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923

  # 3. Read the cached precomputed JSON payload directly from RAM
  GET sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923

  # 4. Check memory statistics
  INFO memory
  ```

* **Option 2 (Built-in Live Inspector Script — No CLI needed):**
  In your backend terminal:
  ```powershell
  .\venv\Scripts\python.exe scripts/inspect_db.py
  ```
  *(Instantly queries Redis and MongoDB, printing all active `sp:*` keys, remaining TTLs, collections, and record counts!)*

* **Option 3 (Python one-liner):**
  ```powershell
  .\venv\Scripts\python.exe -c "import redis; r = redis.Redis(port=6379, protocol=2); print('Active Keys:', r.keys('sp:*'))"
  ```

#### 4. Live UI Action:
- On the web app, navigate to **Study Paths** (`/study-path`).
- Select **Raft Consensus** (or any concept).
- Point out the green badge on the top right:
  **`⚡ 6 ms (Redis fast-path)`** or **`⚡ 11 ms (Redis fast-path)`**.
- **What to tell the reviewer:**  
  *"Notice how the response time is under 10 milliseconds. This proves that the backend bypassed disk I/O and served the precomputed topological sequence directly from Redis RAM."*

---

### Database 3: Elasticsearch (Distributed Full-Text Search & Similarity)

#### 1. Why Elasticsearch? (Academic Defense)
MongoDB's `$regex` search performs table-scan pattern matching, which does not scale, lacks relevance ranking, and fails completely on typos.  
Elasticsearch builds an **inverted index with BM25 probabilistic relevance ranking**. It performs typo-tolerant fuzzy matching (Levenshtein distance) and computes cross-document content similarity using `more_like_this` queries.

#### 2. What is Stored in Elasticsearch:
Index Prefix: `studypath_*`
- `studypath_notes`: Inverted index of user notes (`title`, `content`, `tags`, `owner_id`).
- `studypath_documents`: Inverted index of document chunks (`text`, `chunk_index`, `filename`, `owner_id`).

#### 3. How to Start Elasticsearch (Port 9200):
Your Elasticsearch instance is located at:
`C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5`

1. **Pre-configured Security:**
   `xpack.security.enabled: false` is already configured in `config\elasticsearch.yml`, allowing direct connection over `http://localhost:9200` without SSL certificates or passwords.
2. **Start the service:**
   ```powershell
   .\start_elasticsearch.bat
   ```
   *(Or: `cd C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5\bin; .\elasticsearch.bat`)*  
   *Verify in browser:* Navigate to `http://localhost:9200` ➔ displays the Elasticsearch JSON banner!

#### 4. Live Proof Commands to Run in Front of Reviewer:
Run these in PowerShell:
```powershell
# 1. Inspect Elasticsearch cluster & indices (docs count & size)
curl.exe "http://localhost:9200/_cat/indices?v"

# 2. Test Typo-Tolerant Fuzzy Search (searching misspelled "consensuz")
curl.exe "http://localhost:9200/studypath_notes/_search?q=consensuz~1"
```
*(Notice how searching the typo `"consensuz~1"` immediately matches the document `"Byzantine Fault Tolerance and Quorums"` with its BM25 score!).*

> **💡 Even Easier:** Just run our built-in inspector script:  
> `.\venv\Scripts\python.exe scripts/inspect_db.py`  
> *(Instantly tests MongoDB, Redis, and Elasticsearch fuzzy search all in one terminal command!)*

#### 5. Live UI Action & Graceful Fallback Proof:
- **Typo Tolerance in UI:** In the left sidebar search bar, type a misspelled term like `"consensuz"` or `"virtulizashun"`. Notice that the app successfully matches the document and notes!
- **Graceful Fallback Demonstration (If Elasticsearch is Offline):**
  If Elasticsearch is not running, point to your backend startup log:
  `ElasticSearch unavailable — search will fall back to MongoDB.`
  Explain: *"Our architecture guarantees Zero Single-Point-of-Failure. If Elasticsearch goes offline, search queries automatically fall back to MongoDB regex search with zero application downtime!"*

---

### Database 4: Neo4j (Labeled Property Graph Traversal)

#### 1. Why Neo4j? (Academic Defense)
Relational databases and document stores execute graph traversals by recursively joining tables ($O(N \log N)$) or running recursive aggregation pipelines (`$graphLookup`). As prerequisite depth increases, query latency explodes.  
Neo4j utilizes **Native Index-Free Adjacency**: each node holds direct physical memory pointers to its adjacent relationships and neighbors. Traversing 5 to 10 hops is an $O(k)$ pointer-hopping operation, taking microseconds regardless of total graph size.

#### 2. What is Stored in Neo4j:
Label Prefix: `SP_*`
- Nodes:
  - `(:SP_Concept {id, name, owner_id})`
  - `(:SP_Document {id, filename, owner_id})`
  - `(:SP_Note {id, title, owner_id})`
- Directed Relationships:
  - `(:SP_Concept)-[:PREREQUISITE_OF]->(:SP_Concept)`
  - `(:SP_Document)-[:MENTIONS]->(:SP_Concept)`
  - `(:SP_Note)-[:MENTIONS]->(:SP_Concept)`
  - `(:SP_Note)-[:LINKED_TO]->(:SP_Note)`

#### 3. Live Proof Queries to Run in Front of Reviewer (Neo4j Browser):
Open `http://localhost:7474` in your browser (login: `neo4j` / `password`) and run these two high-impact Cypher queries:

```cypher
// 1. Comprehensive Multi-Model Knowledge Graph (MOST DETAILED GRAPH VIEW)
// Renders all Notes, Documents, and Concepts interconnected by all relationships in one rich visual web!
MATCH (n)-[r]->(m) 
RETURN n, r, m;

// 2. Transitive Prerequisite Hierarchy Chains (Arbitrary-Depth Traversal 1..10 hops)
// Demonstrates native index-free adjacency: renders clear directional learning roadmaps from foundational to advanced concepts
MATCH path = (prereq:SP_Concept)-[:PREREQUISITE_OF*1..10]->(target:SP_Concept)
RETURN path;
```

> **💡 Why these two queries look so impressive in Neo4j Browser:**
> - **Query 1 (`MATCH (n)-[r]->(m) RETURN n, r, m;`):** Neo4j visualizes the entire system graph with distinct color-coded circular nodes (`SP_Document` in red/orange, `SP_Note` in green, `SP_Concept` in blue/purple) connected by labeled arrows (`PREREQUISITE_OF`, `MENTIONS`, `LINKED_TO`). It provides an expansive, detailed graph showing how all database models intersect!
> - **Query 2 (`MATCH path = (prereq)-[:PREREQUISITE_OF*1..10]->(target) RETURN path;`):** Neo4j isolates and renders the pure learning hierarchy as clean multi-hop branches. This directly demonstrates arbitrary-depth traversal ($O(k)$ pointer-hopping), proving why a graph database was chosen over relational recursive joins or MongoDB `$graphLookup`.
>
> *(Bonus Targeted Query if the faculty asks for a specific topic):*
> ```cypher
> // Prerequisite pathway leading specifically up to Raft Consensus:
> MATCH path = (prereq:SP_Concept)-[:PREREQUISITE_OF*1..10]->(target:SP_Concept {id: "raft_consensus"})
> RETURN path;
> ```

#### 4. Live UI Action:
- In the web app, click **Concept Graph** (`/concept-graph`) in the top navigation.
- Show the interactive 2D physics simulation rendering concept nodes and prerequisite edges.
- Click any node (e.g. `Virtualization` or `Raft Consensus`): show how connected documents and prerequisites light up dynamically!

---

## 5. Live UI Walkthrough Checklist (What to Click & Show)

Follow this 6-step demo flow during your presentation:

### 1. Unified Knowledge Base (Notes + PDFs Together)
- Open `http://localhost:3000`.
- In the left sidebar, show that **Text Notes** (`📝 NOTE`) and **PDF Documents** (`📄 PDF`) live together in a single unified list.
- Show that word counts, page counts, tags, and timestamps are displayed cleanly.

### 2. High-Quality Concept Extraction (Domain Ontology)
- Click on **"Cloud Computing and Virtualization.pdf"**.
- Click the **"Extracted Concepts"** sub-tab.
- Point out the genuine technical concepts extracted:
  *Infrastructure as a Service (IaaS)*, *Platform as a Service (PaaS)*, *Software as a Service (SaaS)*, *Virtual Machines*, *Containerization*, *Cloud Computing*, *Virtualization*, *Disaster Recovery*.
- Point out to the reviewer: *"Notice that single-word filler tokens like 'Their', 'Modern', and 'Transformed' are eliminated by our multi-word domain ontology filter."*

### 3. PDF Document Tags & AI Magic Tags
- Point out the **TAGS** section in the PDF header.
- Type `#cloud-architecture` and press `Enter` to show manual tagging.
- Click **"Magic Tags"**: show how AI reads the PDF chunks and generates tags (`#cloud-computing`, `#virtualization`, `#hypervisor`, `#containers`).

### 4. Direct Passage Highlighting from Concept Cards
- In the **Extracted Concepts** tab, click the **"🔍 In Text"** button on the `Cloud Computing` concept card.
- Watch the UI automatically:
  1. Switch to the **Text Chunks** tab.
  2. Display the banner: `🎯 Focusing on Concept: "Cloud Computing"`.
  3. Scroll directly to the relevant chunk.
  4. Highlight the chunk card with a glowing cyan border and render occurrences of the concept in luminous amber `<mark>` tags!

### 5. Study Path Builder & Deep-Linking (`/study-path`)
- Click **Study Paths** in the top navigation.
- Select target concept: **Raft Consensus** (or **Cloud Computing**).
- Show the **Ordered Roadmap**:
  - Step 1: `Leader Election` (Foundational)
  - Step 2: `Raft Consensus` (Intermediate)
- Under **Study Materials**, point out the pills showing the source PDF titles.
- Click the **"📖 Study in PDF →"** button on the card:
  - The app automatically navigates back to the main document viewer, selects the exact source PDF, opens the Text Chunks tab, and highlights the exact passage!

### 6. Personalized Gap Analysis ("What Am I Missing?")
- On `/study-path`, click the **"Gap Analysis ("What Am I Missing?")"** tab.
- Point out the **Readiness Score** circle (e.g. `50%`).
- Click **"Mark Mastered ✓"** on a prerequisite: show how the readiness score recalculates instantly and the concept moves from *Missing Prerequisites* to *Mastered Prerequisites*.

---

## 6. Fault Tolerance & Graceful Degradation (Reviewer "Gotcha" Test)

Faculty panels love testing what happens when a dependency goes down. Smart Notes+ is architected for **zero single points of failure**:

| Failure Scenario | App Behavior | Fallback Mechanism |
| :--- | :--- | :--- |
| **Elasticsearch Down** | Search still works | Automatically falls back to MongoDB regex search (`$or: [title, content, tags]`). UI shows data without crashing. |
| **Neo4j Down** | Graph & Study Paths still work | Authoritative provenance in MongoDB `concept_edges` powers in-memory DFS topological sort. |
| **Redis Down** | All endpoints still respond | Falls back to direct database execution with transparent cache bypass. |
| **Gemini API Down / Quota Exceeded** | Ingestion completes | Deterministic NLP fallback extracts top TF-IDF keywords and heuristic prerequisites without stalling. |

---

## 7. Intentional Consistency Drift & Rebuild Demonstration

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

---

## 8. Technical Viva Defense Cheat Sheet (Q&A)

### Q1: Why didn't you just use MongoDB for everything?
> **Answer:**  
> "MongoDB is fantastic as an authoritative transactional document store, but it suffers from mathematical limitations in two areas:  
> 1. **Multi-Hop Graph Queries:** Finding prerequisite chains 5 to 10 hops deep in MongoDB requires recursive `$graphLookup` pipelines that perform multiple collection scans and degrade exponentially ($O(N \log N)$). Neo4j uses native index-free adjacency where each node holds physical pointers to its neighbors, executing traversals in microseconds ($O(k)$).  
> 2. **Full-Text Ranking:** MongoDB regex searches do full table scans and lack relevance ranking. Elasticsearch provides an inverted index with BM25 probabilistic scoring, typo tolerance, and term-frequency boosting."

### Q2: How do you prevent data inconsistency across 4 databases (The Dual-Write Problem)?
> **Answer:**  
> "We implement the **Authoritative Source of Truth Pattern**:  
> - **MongoDB** is the single transactional source of truth. Every document, note, concept, edge, and user action is written and committed to MongoDB first.  
> - **Elasticsearch, Neo4j, and Redis** act as derived read models. If a write to Neo4j or Elasticsearch fails, the transaction does not corrupt. The entity is safe in MongoDB, and our background reconciliation script (`rebuild.py`) can replay provenance from MongoDB to rebuild Neo4j edges and Elasticsearch indices at any time."

### Q3: What happens if two concepts are spelled slightly differently across documents?
> **Answer:**  
> "All concepts undergo deterministic canonical normalization during extraction:  
> - Punctuation and hyphens are stripped.  
> - Text is converted to lowercase.  
> - Whitespace is unified into snake_case.  
> For example, `Leader Election`, `leader election`, and `leader_election` all normalize to the unique identifier `leader_election`. This guarantees that identical concepts across different PDFs and notes merge onto the same node in Neo4j and MongoDB."

### Q4: How did you handle circular prerequisite dependencies in user notes?
> **Answer:**  
> "Human-written notes and textbooks often introduce circular dependencies (e.g. $A \rightarrow B \rightarrow C \rightarrow A$).  
> Before generating any study path, our engine runs a **3-color Depth-First Search (DFS) cycle-detection algorithm**. When a back-edge pointing to an active ancestor node is discovered:  
> 1. The cycle is isolated.  
> 2. The offending edge is safely broken using a feedback arc set.  
> 3. A warning banner is logged for the user.  
> 4. Kahn's topological sort is executed on the resulting Directed Acyclic Graph (DAG) to guarantee a strictly monotonic, cycle-safe learning sequence."

---

## 9. Quick Verification Checklist

| Requirement / Store | Implementation | Verification Status | Proof to Show Evaluator |
| :--- | :--- | :---: | :--- |
| **Namespace Isolation** | Dynamic Prefixes (`studypath_`, `sp:`, `SP_`) | **VERIFIED** | Startup log confirms `smartnotes_studypath`; refuses invalid namespace. |
| **MongoDB Document Store** | BSON Collections on Port 27017 | **VERIFIED** | `mongosh` shows `documents`, `chunks`, `concept_mentions`, `user_known_concepts`. |
| **Redis In-Memory Cache** | Key-Value Cache on Port 6379 | **VERIFIED** | `redis-cli` shows `sp:studypath:*` with TTL; web UI shows `⚡ 6 ms (Redis fast-path)`. |
| **Elasticsearch Inverted Index** | BM25 Engine on Port 9200 | **VERIFIED** | Typo-tolerant search (`consensuz` matches `Raft Consensus`); `cat/indices` lists docs. |
| **Neo4j Property Graph** | Index-Free Adjacency on Port 7687 | **VERIFIED** | Neo4j Browser renders complete detailed graph via `MATCH (n)-[r]->(m) RETURN n, r, m;` |
| **Cycle-Safe Study Path** | 3-Color DFS & Kahn's Topological Sort | **VERIFIED** | Linear roadmap: `Leader Election` ➔ `Raft Consensus` ➔ `Distributed State Machine`. |
| **Passage Highlighting** | Deep-Link URL Router + Amber `<mark>` | **VERIFIED** | Clicking study pill jumps directly to PDF reader and highlights target passage. |
| **PDF Tagging & Magic Tags** | REST Endpoint + Gemini AI Taxonomy | **VERIFIED** | User-editable tags with automated AI suggestions synced to MongoDB. |
