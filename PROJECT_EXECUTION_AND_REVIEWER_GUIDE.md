# Smart Notes+ Study Path Builder: Execution & Reviewer Evaluation Guide
## A Polyglot Persistence Knowledge Engine (MongoDB, Redis, Elasticsearch, Neo4j)

---

## 1. Executive Summary & Core Academic Thesis

### The Core Defense Thesis
> **"Each database answers a question the others cannot answer well."**
> 
> In a conventional single-database system (e.g. relational SQL or document-only), developers either compromise on multi-hop graph performance, sacrifice full-text search relevance, or overload primary transactional stores with ephemeral caching. 
> 
> **Smart Notes+ Study Path Builder** addresses this by implementing a **true Polyglot Persistence architecture** where four specialized database engines fulfill specific, mathematically grounded roles:
> 1. **MongoDB (Document Model — Port 27017):** Authoritative single source of truth for semi-structured text notes, uploaded PDF metadata, 400-word sliding-window chunk provenance, and student mastery state.
> 2. **Neo4j (Property Graph Model — Port 7687/7474):** Traversal engine for directed acyclic prerequisite trees, multi-hop relationship discovery (`PREREQUISITE_OF`, `MENTIONS`), and cycle-breaking topological sorting with native index-free adjacency.
> 3. **Elasticsearch (Distributed Inverted Index — Port 9200):** Text-similarity engine utilizing BM25 probabilistic relevance ranking, fuzzy typo-tolerance, and multi-field weighted scoring.
> 4. **Redis (In-Memory Key-Value — Port 6379):** Sub-millisecond ephemeral cache for precomputed topological study paths, token-bucket rate limiters for external AI quotas, and worker lease locks.

---

## 2. System Architecture & Component Mapping

```
+----------------------------------------------------------------------------------------------------+
|                                    NEXT.JS 16 WEB FRONTEND                                         |
|  [Notes Editor]   [PDF Ingestion]   [Study Path Stepper]   [Gap Analysis]   [Interactive Graph]    |
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

## 3. Step-by-Step Execution Guide (In Strict Order)

Follow these steps sequentially to run the full application from a clean state.

### Step 1: Start the 4 Native Database Services

All 4 database engines run natively on your Windows environment:

1. **MongoDB (Port 27017):**
   ```powershell
   net start MongoDB
   ```
   *(Or verify running in Windows Services / PowerShell: `Get-Service MongoDB`)*

2. **Redis (Port 6379):**
   ```powershell
   redis-server
   ```
   *(Or verify running: `redis-cli ping` ➔ returns `PONG`)*

3. **Elasticsearch (Port 9200):**
   Start Elasticsearch from your local installation:
   ```powershell
   # In your Elasticsearch installation bin folder:
   .\elasticsearch.bat
   ```
   *(Verify running: `curl http://localhost:9200` ➔ returns cluster JSON info)*

4. **Neo4j Desktop (Port 7687 Bolt, 7474 HTTP):**
   - Open **Neo4j Desktop** on your desktop.
   - Click **Start** on your active DBMS project.
   - *(Verify running: open browser at `http://localhost:7474`)*

#### Quick Port Verification (PowerShell):
Run this single command to verify all 4 ports are actively listening:
```powershell
Get-NetTCPConnection -LocalPort 27017, 6379, 9200, 7687 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, State
```

---

### Step 2: Environment Configuration & Namespace Guard

In `c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend\.env`:

```ini
APP_NAMESPACE_CONFIRMED=studypath
DATABASE_NAME=smartnotes_studypath
ES_INDEX_PREFIX=studypath_
REDIS_KEY_PREFIX=sp:
NEO4J_LABEL_PREFIX=SP_

MONGODB_URL=mongodb://127.0.0.1:27017
REDIS_URL=redis://127.0.0.1:6379/0
ELASTICSEARCH_URL=http://127.0.0.1:9200
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

SECRET_KEY=your_jwt_secret_key
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

> **Why the Namespace Guard matters to faculty reviewers:**
> The backend contains an automatic safety guard. If someone attempts to boot the application with `DATABASE_NAME=smartnotes` or an empty prefix, the backend **refuses to start**. This guarantees existing university projects or databases are never touched or contaminated.

---

### Step 3: Start the Backend (FastAPI on Port 8000)

Open **Terminal 1** (PowerShell):

```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend

# Activate python virtual environment
.\venv\Scripts\Activate.ps1

# Run FastAPI backend with uvicorn
uvicorn main:app --port 8000 --reload
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
Connected to Neo4j
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8000
```

---

### Step 4: Start the Web Frontend (Next.js on Port 3000)

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
- Network: http://192.168.x.x:3000
✓ Ready in 1.4s
```

---

### Step 5: Access the Web Application & Demo Account

1. Open your browser and navigate to: **`http://localhost:3000`**
2. The application automatically redirects unauthenticated users to the **Login Page**.
3. **Demo Credentials:**
   - **Email:** `demo@studypath.io`
   - **Password:** `demopass123`
   *(Alternatively, use `alice` / `password123` or click **Sign Up** to create a fresh user account).*

---

### Step 6: One-Command Automated Demo Seeder & Formal Verification

Before or during your viva presentation, you can run these two automated scripts:

#### A. Seed Realistic Lecture Data (Notes, PDFs, Concept Prerequisite Chains):
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
cmd /c "set PYTHONPATH=. && python scripts/seed_demo.py"
```
*Seeds 3 PDF textbooks/papers, 2 text notes, and extracts 8+ interconnected technical concepts with prerequisites (`Leader Election` ➔ `Raft Consensus` ➔ `Distributed State Machine`, `CAP Theorem`, `Redis Caching`).*

#### B. Run the 12-Check Formal Verification Suite:
```powershell
cd c:\Users\aryan\Desktop\NoSQL_Assignment\notes\backend
cmd /c "set PYTHONPATH=. && python scripts/smoke_test.py"
```
*Executes 12 automated checks across all 4 stores, outputting a formal verification table confirming that every database engine is functioning properly.*

---

## 4. How to Prove the 4 Databases to the Reviewer

When the reviewer asks: *"Prove to me that you actually used 4 databases and explain why each is necessary,"* walk through the 4 sections below.

---

### Database 1: MongoDB (Authoritative Document Store)

#### 1. Why MongoDB? (Academic Defense)
MongoDB is the **authoritative single source of truth**. Document stores excel at storing semi-structured, polymorphic content (notes with varying tags, PDF metadata, variable word-count chunks with bounding box offsets, and student mastery logs) without requiring complex table migrations.

#### 2. What is Stored in MongoDB:
Database name: `smartnotes_studypath`
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
Open **MongoDB Compass** ➔ Connect to `mongodb://localhost:27017` ➔ Navigate to `smartnotes_studypath` ➔ Show the document schema and chunk collections live.

#### 5. Live UI Action:
- In the Web UI (`http://localhost:3000`), click **"Cloud Computing and Virtualization.pdf"**.
- Add a new tag `#cloud-native` in the **TAGS** section.
- Instantly re-run `db.documents.find({filename: /Cloud/}, {tags: 1})` in `mongosh` to show the tag was updated in MongoDB in real time.

---

### Database 2: Redis (In-Memory Key-Value & Ephemeral State)

#### 1. Why Redis? (Academic Defense)
Computing multi-hop topological sorts, transitive prerequisite closures, and cycle-breaking graphs is CPU-intensive ($O(V + E)$). Running this graph calculation on every single page render would overload the database. 
Redis stores **precomputed study paths and graphs in RAM** using sub-millisecond RESP2 serialization with a 300-second TTL. It also powers the distributed token-bucket rate limiter that enforces Google Gemini API quota protection.

#### 2. What is Stored in Redis:
Key prefix: `sp:*`
- `sp:studypath:path:<target_concept>:<owner_id>`: Precomputed topologically sorted learning path (JSON cached for 300s).
- `sp:studypath:graph:<owner_id>`: Serialized node-and-edge graph for instant 60 FPS rendering.
- `sp:studypath:gap:<target_concept>:<owner_id>`: Precomputed readiness score and missing prerequisite gap analysis.
- `sp:user:<user_id>:recent_notes`: Ephemeral list of recently viewed notes/documents.
- `sp:worker:lease:<document_id>`: Distributed lease lock with automatic heartbeat renewal preventing duplicate background PDF workers.

#### 3. Live Proof Commands to Run in Front of Reviewer:
Open a terminal and run `redis-cli`:
```bash
redis-cli

# 1. View all active keys under the studypath namespace prefix
KEYS sp:*

# 2. Check the TTL (Time-To-Live countdown in seconds) of a cached study path
TTL sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923

# 3. Inspect the cached JSON study path payload
GET sp:studypath:path:raft_consensus:6ad64233ca40f0090119f923
```

#### 4. Live UI Action:
- On the web app, navigate to **Study Paths** (`/study-path`).
- Select **Raft Consensus**.
- Point out the green badge on the top right:
  **`⚡ 6 ms (Redis fast-path)`** or **`⚡ 11 ms (Redis fast-path)`**.
- Explain: *"Notice how the response time is under 10 milliseconds. This proves that the backend bypassed disk I/O and served the precomputed topological sequence directly from Redis RAM."*

---

### Database 3: Elasticsearch (Distributed Full-Text Search & Similarity)

#### 1. Why Elasticsearch? (Academic Defense)
MongoDB's `$regex` search performs table-scan pattern matching, which does not scale, lacks relevance ranking, and fails on typos.
Elasticsearch builds an **inverted index with BM25 probabilistic relevance ranking**. It performs typo-tolerant fuzzy matching (Levenshtein distance) and computes cross-document content similarity using `more_like_this` queries.

#### 2. What is Stored in Elasticsearch:
Index prefix: `studypath_*`
- `studypath_notes`: Inverted index of user notes (`title`, `content`, `tags`, `owner_id`).
- `studypath_documents`: Inverted index of document chunks (`text`, `chunk_index`, `filename`, `owner_id`).

#### 3. Live Proof Commands to Run in Front of Reviewer:
Run these curl requests in PowerShell or terminal:
```powershell
# 1. Inspect Elasticsearch indices and document counts
curl http://localhost:9200/_cat/indices?v

# 2. Inspect index mapping (shows BM25 analyzers and multi-fields)
curl http://localhost:9200/studypath_notes/_mapping

# 3. Test Typo-Tolerant Fuzzy Search (Searching misspelled "consensuz")
curl -X POST "http://localhost:9200/studypath_notes/_search" -H "Content-Type: application/json" -d '{
  "query": {
    "multi_match": {
      "query": "consensuz",
      "fields": ["title^3", "content", "tags^2"],
      "fuzziness": "AUTO"
    }
  }
}'
```

#### 4. Live UI Action & Graceful Fallback Proof:
- **Typo Tolerance in UI:** In the left sidebar search bar, type a misspelled term like `"consensuz"` or `"virtulizashun"`. Notice that the app successfully matches the document and notes!
- **Graceful Fallback Demonstration:** If Elasticsearch is ever stopped, demonstrate that the search bar does not crash — the backend automatically detects ES unavailability and executes a transparent regex fallback in MongoDB!

---

### Database 4: Neo4j (Labeled Property Graph Traversal)

#### 1. Why Neo4j? (Academic Defense)
Relational databases and document stores execute graph traversals by recursively joining tables ($O(N \log N)$) or running recursive aggregation pipelines (`$graphLookup`). As prerequisite depth increases, query latency explodes.
Neo4j utilizes **Native Index-Free Adjacency**: each node holds direct physical memory pointers to its adjacent relationships and neighbors. Traversing 5 to 10 hops is an $O(k)$ pointer-hopping operation, taking microseconds regardless of total graph size.

#### 2. What is Stored in Neo4j:
Label prefix: `SP_*`
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

## 5. Key Highlights to Demonstrate in the Web UI

When guiding the faculty panel through the live web application, demonstrate these 6 capabilities in order:

### 1. Unified Knowledge Base (Notes + PDFs Together)
- Show the left sidebar: Text notes (`📝 NOTE`) and uploaded PDF documents (`📄 PDF`) live side-by-side.
- Show that tags, word counts, page counts, and last modified dates update in real time.

### 2. Ingesting a PDF & Automatic Concept Extraction
- Click **"Cloud Computing and Virtualization.pdf"**.
- Click the **"Extracted Concepts"** sub-tab:
  - Show genuine multi-word technical concepts: *Infrastructure as a Service (IaaS)*, *Platform as a Service (PaaS)*, *Software as a Service (SaaS)*, *Virtual Machines*, *Containerization*, *Cloud Computing*, *Virtualization*, *Disaster Recovery*.
  - Point out that single-word junk (such as *"Their"*, *"Modern"*, *"Transformed"*) is completely eliminated by the domain knowledge ontology.

### 3. PDF Document Tags & AI Magic Tags
- In the PDF viewer, point out the **TAGS** section.
- Type `#cloud-architecture` and press `Enter`: show that the tag is added and synced to MongoDB.
- Click the **"Magic Tags"** button: watch AI analyze the document chunks and generate relevant tags (e.g., `#cloud-computing`, `#virtualization`, `#hypervisor`, `#containers`).

### 4. Direct Passage Highlighting from Concept Cards
- In the **Extracted Concepts** tab, click the **"🔍 In Text"** button on the `Cloud Computing` concept card.
- Watch the viewer automatically:
  1. Switch to the **Text Chunks** tab.
  2. Display the banner: `🎯 Focusing on Concept: "Cloud Computing"`.
  3. Scroll directly to the relevant chunk.
  4. Highlight the chunk card with a glowing cyan border and render occurrences of the concept in luminous amber `<mark>` tags!

### 5. Study Path Builder & Deep Linking (`/study-path`)
- Click **Study Paths** in the top navigation.
- Select target concept: **Raft Consensus** (or **Cloud Computing**).
- Point out the **Ordered Roadmap**:
  - Step 1: `Leader Election` (Foundational)
  - Step 2: `Raft Consensus` (Intermediate)
- Under **Study Materials**, point out the pills showing the source PDF titles.
- Click the **"📖 Study in PDF →"** button on the card:
  - The app automatically navigates back to the main document viewer, selects the exact source PDF, opens the Text Chunks tab, and highlights the exact passage!

### 6. Personalized Gap Analysis ("What Am I Missing?")
- On `/study-path`, click the **"Gap Analysis ("What Am I Missing?")"** tab.
- Point out the **Readiness Score** circle (e.g. `50%` or `100%`).
- Click **"Mark Mastered ✓"** on a prerequisite: show how the readiness score recalculates instantly and the concept moves from *Missing Prerequisites* to *Mastered Prerequisites*.

---

## 6. Technical Viva Q&A (Reviewer Questions & Model Answers)

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

### Q5: What happens if one of the 4 databases goes down?
> **Answer:**
> "The architecture features **Zero Single-Point-of-Failure Graceful Degradation**:
> - If **Elasticsearch** is down: search queries automatically fall back to MongoDB regex search (`$or: [title, content, tags]`).
> - If **Neo4j** is down: study path traversals and cycle breaking automatically fall back to an in-memory DFS traversal over MongoDB's `concept_edges` collection.
> - If **Redis** is down: cache reads transparently bypass Redis and query the databases directly.
> The user experience never crashes."

---

## 7. Verification Summary Table

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

---
*Created for University NoSQL & Polyglot Persistence Evaluation Defense.*
