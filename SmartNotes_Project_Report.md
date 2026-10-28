# Project Report: Smart Notes+ Study Path Builder
## An AI-Powered Polyglot Persistence Knowledge Engine & Study Path Roadmap Architecture

---

## 1. Executive Summary & Core Academic Thesis

### Core Defense Thesis
> **"Each database answers a question the others cannot answer well."**
> 
> In a conventional single-database system (e.g. relational SQL or document-only), developers either compromise on multi-hop graph performance, sacrifice full-text search relevance, or overload primary transactional stores with ephemeral caching. 
> 
> **Smart Notes+ Study Path Builder** addresses this by implementing a **true Polyglot Persistence architecture** where four specialized database engines fulfill specific, mathematically grounded roles:
> 1. **MongoDB (Document Model):** Authoritative single source of truth for semi-structured text notes, uploaded PDF metadata, sliding-window chunk provenance, and student mastery state.
> 2. **Neo4j (Property Graph Model):** Traversal engine for directed acyclic prerequisite trees, multi-hop relationship discovery (`PREREQUISITE_OF`, `MENTIONS`), and cycle-breaking topological sorting.
> 3. **Elasticsearch (Distributed Inverted Index):** Text-similarity engine utilizing BM25 probabilistic relevance ranking, fuzzy typo-tolerance, and multi-field weighted scoring.
> 4. **Redis (In-Memory Key-Value & Data Structures):** Sub-millisecond ephemeral cache for precomputed topological paths, token-bucket rate limiters for external AI quotas, and worker lease locks.

---

## 2. System Architecture & Database Role Separation

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

### Detailed Breakdown of Database Roles

| Database | Model Type | Local Instance | Authoritative Role in Smart Notes+ |
| :--- | :--- | :--- | :--- |
| **MongoDB** | Document Store (BSON) | Native Service (`27017`) | **Authoritative Source of Truth.** Handles all ACID transactional writes. Stores semi-structured PDF metadata, variable sliding-window chunk offsets, raw extracted concept provenance, and user mastery records. |
| **Neo4j** | Labeled Property Graph | Native Desktop (`7687/7474`) | **Prerequisite & Relationship Traversal.** Implements index-free adjacency for arbitrary-depth queries (`PREREQUISITE_OF*1..10`). Answers: *"What is the ordered learning path to reach concept X?"* |
| **Elasticsearch** | Inverted Search Index | Native Service (`9200`) | **Text Search & Content Similarity.** Inverted index with BM25 probabilistic relevance ranking and typo-tolerant fuzziness. Answers: *"Which lecture note chunks discuss similar concepts?"* |
| **Redis** | In-Memory Key-Value | Native Service (`6379`) | **Ephemeral Caching & Throttling.** In-memory key-value store with TTL expirations. Caches precomputed study paths (sub-10ms response), token-bucket rate limits (15 RPM for Gemini), and worker leases. |

---

## 3. Core Engine Implementations

### A. Document Ingestion & Sliding-Window Chunking Pipeline
1. **Streaming Upload & Validation:**
   - Validates `%PDF-` magic bytes in the first 1024 bytes (rejecting fake extensions).
   - Enforces a 15 MB file size limit and 50-page maximum.
   - Computes SHA-256 fingerprint for instantaneous upload deduplication.
2. **Sliding-Window Chunking:**
   - Word-level sliding window: 400 words with 80 words overlap.
   - Overlap guarantees technical concepts and definitions spanning page boundaries are never fragmented or missed by AI extraction.
3. **Structured Concept Extraction:**
   - Extracts key technical concepts (normalized into lowercase snake_case) and directed prerequisite relationships (`A -> B`).
   - Rate-regulated via a 15 RPM token bucket throttle matching Google's Gemini baseline limits.
   - Deterministic offline replay fixture cache keyed by `SHA-256(chunk_text + prompt_version)` for zero-cost test idempotency.

### B. Topological Study Path Engine & Safe Cycle Handling
1. **Transitive Subgraph Traversal:**
   - Traverses all prerequisite paths required for target concept using Cypher variable-length paths with an authoritative MongoDB fallback.
2. **Directed Cycle Detection & Breaking:**
   - Textbooks and lecture notes often contain circular concept references (e.g., $A \rightarrow B \rightarrow C \rightarrow A$).
   - A 3-color Depth First Search (DFS) algorithm identifies directed cycles during traversal.
   - Any back-edge is isolated, logged as a visible user warning banner, and removed using a feedback arc set.
   - Kahn's algorithm or reverse post-order DFS generates a deterministic, linear sequence of prerequisite study steps.
3. **Depth Calculation:**
   - Each step receives a calculated topological depth level:
     - Level 0: Foundational Concepts
     - Level 1: Intermediate Concepts
     - Level 2+: Advanced Concepts

### C. Personalization & Gap Analysis ("What Am I Missing?")
1. **Student Progress State:**
   - Stored in MongoDB collection `user_known_concepts` scoped strictly by `owner_id`.
   - Toggleable via `POST /api/study-paths/known-concepts/{id}` and `DELETE /api/study-paths/known-concepts/{id}`.
2. **Real-Time Readiness Metric:**
   $$\text{Readiness Percentage} = \left( \frac{\text{Known Prerequisites}}{\text{Total Prerequisites}} \right) \times 100$$
3. **Actionable Roadmap:**
   - Divides prerequisites into **Mastered Prerequisites** and **Missing Prerequisites** (ordered topologically so students know exactly what to learn next).

---

## 4. Multi-Tenant Isolation & Zero Single-Point-of-Failure Resilience

### Strict Namespace Guard
To guarantee existing university projects are never contaminated:
- The backend refuses to start unless `APP_NAMESPACE_CONFIRMED == "studypath"` and `DATABASE_NAME != "smartnotes"`.
- Every collection, index, label, and cache key uses dynamic, non-empty prefixes:
  - MongoDB: `smartnotes_studypath`
  - Elasticsearch: `studypath_*`
  - Redis: `sp:*`
  - Neo4j: `SP_*`
- Every query across all four stores filters strictly by `owner_id`. User B receives an HTTP 404 for all User A resources.

### Fault Tolerance & Graceful Degradation Matrix

| Store | Failure Mode | Observed Behavior | Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Elasticsearch** | Service Stopped | Full-text search remains operational | System automatically falls back to MongoDB regex search (`$or: [title, content, tags]`). |
| **Neo4j** | Service Stopped | Study paths & graphs continue generating | Provenance collections in MongoDB (`concept_edges`, `concept_mentions`) power DFS topological sorting in memory. |
| **Redis** | Service Stopped | API responses succeed without interruption | Reads bypass cache and query databases directly with transparent retry. |
| **Gemini API** | Quota Limit / Network Down | Ingestion completes without hanging | Deterministic TF-IDF heuristic extraction parses dominant technical keywords and heuristic edges. |

---

## 5. Formal Verification Matrix (12 Smoke Checks)

All 12 checks were executed against live local databases using `python scripts/smoke_test.py`:

| # | Requirement Tested | Primary Store | Status | Verification Evidence |
| :---: | :--- | :--- | :---: | :--- |
| **1** | Namespace Guard | Config / System | **[PASS]** | Isolated DB `smartnotes_studypath` verified; refuses on unconfirmed. |
| **2** | MongoDB Reachability | MongoDB | **[PASS]** | Native service ping response: `{'ok': 1.0}` on port 27017. |
| **3** | PDF Streaming Upload | MongoDB / FS | **[PASS]** | Magic bytes verified (`%PDF-`), file streamed, HTTP 200 returned. |
| **4** | Upload Deduplication | MongoDB | **[PASS]** | Second upload with identical SHA-256 returned HTTP 409 Conflict. |
| **5** | Chunking & Provenance | MongoDB | **[PASS]** | 400-word sliding-window chunks indexed with SHA-256 content hashes. |
| **6** | Topological Study Path | Neo4j / Mongo | **[PASS]** | Returned monotonic topological order: `leader_election -> raft -> state_machine`. |
| **7** | Cycle Detection & Arc Breaking | Algorithm | **[PASS]** | Cyclic edge detected, back-edge broken, and valid linear path returned. |
| **8** | Gap Analysis ("What Am I Missing?") | Mongo / Logic | **[PASS]** | Toggling known concept updated readiness score from 0.0% to 33.3% in real-time. |
| **9** | Cross-Source Linking (PDF <-> Note) | Neo4j / ES | **[PASS]** | Text note linked to PDF via shared concept `Raft Consensus`. |
| **10** | Strict Two-User Isolation | Security / Auth | **[PASS]** | User B received HTTP 404 for User A's document, file, and note. |
| **11** | Ephemeral Redis Caching | Redis | **[PASS]** | Subsequent study path query served from Redis fast-path in 6.3 ms. |
| **12** | Cascade Deletion | MongoDB | **[PASS]** | Deleting document removed document, chunks, mentions, and file cleanly. |

---

## 6. Viva Defense Technical Q&A

### Q1: Why didn't you just use MongoDB for everything?
> **Answer:** MongoDB is outstanding for document storage and horizontal write scaling. However:
> 1. Multi-hop transitive graph traversals (e.g. finding 5-hop prerequisite chains or topological sorting) in MongoDB require recursive `$graphLookup` pipelines that degrade exponentially with dataset size because MongoDB lacks index-free adjacency. Neo4j executes pointer-hopping in microseconds.
> 2. Full-text search in MongoDB lacks the BM25 probabilistic relevance ranking, fuzzy typo-tolerance, and term-frequency boosting that Elasticsearch provides natively.

### Q2: How do you prevent data inconsistency across four databases (Dual-Write Problem)?
> **Answer:** We adopt the **Authoritative Source of Truth Pattern**:
> - MongoDB is the only transactional authority. Every entity (document, note, concept, edge) is written to MongoDB first.
> - Elasticsearch, Neo4j, and Redis are derived read models. If an external write to Neo4j fails, the transaction does not corrupt; the document remains saved in MongoDB, and the `rebuild.py` script can wipe and repopulate the read models at any time directly from MongoDB.

### Q3: What happens if two concepts have slightly different spellings in different PDFs?
> **Answer:** Concepts undergo unified normalization during ingestion: punctuation removal, lowercasing, and whitespace unification to snake_case (`Leader Election` and `leader_election` resolve to the identical concept ID `leader_election`).

---

## 7. Conclusion

Smart Notes+ Study Path Builder demonstrates that **Polyglot Persistence** is not merely a theoretical concept, but an architectural necessity for modern knowledge engineering. By aligning the specific mathematical strengths of Document, Graph, Search, and In-Memory data models, the system delivers an experience that is fast, resilient, and academically rigorous.
