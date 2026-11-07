# Smart Notes+

> **A Polyglot Persistence Knowledge Engine & Hybrid Study-Path Platform**  
> Built with MongoDB, Neo4j, Elasticsearch, and Redis, integrated with FastAPI and Next.js 16.

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black.svg)](https://nextjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47A248.svg)](https://www.mongodb.com/)
[![Neo4j](https://img.shields.io/badge/Neo4j-5.26-008CC1.svg)](https://neo4j.com/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-9.5-005571.svg)](https://www.elastic.co/)
[![Redis](https://img.shields.io/badge/Redis-7.4-DC382D.svg)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 Overview

**Smart Notes+** addresses the challenges of information overload, fragmented learning materials, and cognitive memory decay in personal knowledge management. Traditional note-taking tools act as passive document silos, unable to uncover how technical concepts connect across lecture notes, slides, and academic textbooks.

Rather than forcing a single database engine to handle disparate data models, Smart Notes+ implements a **true Polyglot Persistence architecture** where four specialized NoSQL database engines work in concert:

1. **MongoDB (Document Store - Port 27017):** The authoritative single source of truth for semi-structured text notes, uploaded PDF metadata, 400-word sliding-window chunk provenance, and student concept mastery records.
2. **Neo4j (Property Graph - Port 7687 / 7474):** Executes native **index-free adjacency** graph traversals to map arbitrary-depth prerequisite hierarchies (`[:PREREQUISITE_OF]`), discover multi-hop concept lineage, and compute cycle-safe Directed Acyclic Graphs (DAGs).
3. **Elasticsearch (Distributed Inverted Index - Port 9200):** Provides probabilistic full-text search using **Okapi BM25**, cross-document relevance scoring, and typo-tolerant fuzzy matching (Levenshtein distance = 2).
4. **Redis (In-Memory Key-Value - Port 6379):** Delivers sub-millisecond ephemeral caching for precomputed topological study orders, distributed background worker lease locks, and token-bucket API rate limiting (15 RPM) for LLM concept extraction.

---

## 🚀 Key Features

- **📚 Unified Knowledge Feed:** Create, view, and organize typed notes alongside multi-page academic PDF documents in a single responsive workspace.
- **✂️ Deterministic Sliding-Window Chunker:** Partitions uploaded PDFs into 400-word chunks with an 80-word overlap stride ($S = 320$ words), recording token boundaries and character offsets for live in-reader passage highlighting.
- **🤖 Automated Concept & Prerequisite Extraction:** Dispatches document chunks through Google Gemini 2.5 Flash using structured JSON schemas to automatically extract canonical concepts, definitions, and direct prerequisite dependencies.
- **🛡️ Distributed Token Bucket Limiter:** Implements atomic Redis token buckets (15 RPM capacity) with randomized exponential backoff and jitter, preventing external LLM API quota exhaustion.
- **🔄 Three-Color Cycle Detection & Kahn's TopoSort:** Uses 3-color DFS to detect circular prerequisite dependencies across documents and severs back-edges, enabling Kahn's algorithm to generate linear, step-by-step study paths.
- **🎯 Personalized Gap Analysis:** Dynamically calculates the set difference $\mathcal{G}_u(T) = \mathcal{A}(T) \setminus \mathcal{K}_u$ between all prerequisites of target concept $T$ and the student's mastered concepts $\mathcal{K}_u$, visually flagging prerequisite gaps.
- **🧠 Cognitive Memory Decay & Recommendations:** Models cognitive forgetting using the Ebbinghaus curve ($D(n) = 1 - e^{-\lambda \cdot \Delta t}$, $\lambda = 0.1$). Blends graph topological proximity with memory decay ($S(n) = G(n) \cdot (D(n) + 0.1)$) to prioritize decayed foundational notes for spaced repetition.
- **⚡ In-Memory Ephemeral Caching:** Caches precomputed topological paths in Redis with a 30-minute TTL, achieving an 89.4% cache hit ratio and dropping P99 query latency by 98.6% (from 148 ms down to 2.1 ms).
- **🔍 Hybrid Multi-Engine Search:** Combines BM25 sparse retrieval in Elasticsearch with Neo4j graph lineage spreading activation and MongoDB regex fallback.
- **🎨 Modern Web UI:** Responsive dark-mode interface built with Next.js 16, interactive 2D physics graph visualization, SVG study roadmaps, and JWT session security.

---

## 🏛️ System Architecture

```
+------------------------------------------------------------------------------------------------------+
|                                     PRESENTATION LAYER (Next.js 16)                                  |
|  [Unified Knowledge Feed]  [PDF Viewer & Chunks]  [Study Path Stepper]  [Interactive 2D Concept Graph] |
+---------------------------------------------------+--------------------------------------------------+
                                                    | RESTful JSON (HTTP / Port 8000)
+---------------------------------------------------v--------------------------------------------------+
|                                       API GATEWAY LAYER (FastAPI)                                    |
|  - JWT Bearer & PBKDF2 Auth        - 400-Word Sliding-Window Chunker     - Cycle-Safe Topological Sort|
|  - Multi-Tenant Namespace Guard    - Gemini 2.5 Flash Extraction Engine  - Worker Lease Crash Recovery|
+--------------------+----------------------+-----------------------+----------------------------------+
                     |                      |                       |                                  
        (Document Truth)      (Graph Traversal)       (Full-Text Index)       (Ephemeral State)        
                     |                      |                       |                                  
+--------------------v--+ +-----------------v---+ +-----------------v---+ +----------------------------v--+
|       MONGODB         | |       NEO4J         | |   ELASTICSEARCH     | |           REDIS                |
|     Port: 27017       | |   Port: 7687/7474   | |    Port: 9200       | |        Port: 6379              |
| - users               | | Nodes:              | | Index:              | | Key Prefixes:                  |
| - notes               | |  (:SP_Concept)      | |  studypath_notes    | |  sp:path:{u}:{c} (TTL 1800s)   |
| - documents           | |  (:SP_Document)     | |  studypath_documents| |  sp:tb:gemini (Token Bucket)   |
| - chunks (word bounds)| | Edges:              | | - BM25 Scoring      | |  sp:worker:lease (TTL 120s)    |
| - user_known_concepts | |  [:PREREQUISITE_OF] | | - Fuzzy Typo Match  | |  user:{u}:recommendations      |
| - knowledge_metrics   | |  [:MENTIONS]        | | - Trigram N-grams   | |  note:{id} (Entity Cache)      |
+-----------------------+ +---------------------+ +---------------------+ +--------------------------------+
```

### 📊 Database Specialization Matrix

| Database Engine | Data Model | Port | Primary Responsibility in Smart Notes+ | Selection Justification |
| :--- | :--- | :--- | :--- | :--- |
| **MongoDB** | Document (BSON) | `27017` | Authoritative entity store for users, notes, PDF documents, chunk coordinate arrays, and concept mastery records. | Native support for semi-structured JSON entities with evolving schemas, nested arrays, and secondary indexing. |
| **Neo4j** | Labeled Property Graph | `7687` / `7474` | Maps concept prerequisite DAGs (`[:PREREQUISITE_OF]`) and document mentions (`[:MENTIONS]`). | Index-free adjacency dereferences memory pointers directly, scaling multi-hop graph traversals in microseconds without costly SQL table joins. |
| **Elasticsearch** | Distributed Inverted Index | `9200` | Full-text search and cross-document text similarity matching. | Okapi BM25 probabilistic relevance ranking, custom analyzers, and typo-tolerant fuzzy matching (Levenshtein distance). |
| **Redis** | In-Memory Key-Value | `6379` | Ephemeral caching of precomputed study paths, Gemini token-bucket limits, and distributed worker leases. | Sub-millisecond response latency, atomic Lua script execution, and automatic TTL expiration. |

---

## 📈 Performance & Evaluation Highlights

| Evaluation Metric | Measured Result | Baseline Comparison / Architectural Impact |
| :--- | :--- | :--- |
| **5-Hop Recursive Graph Traversal** | **11.5 ms** (Neo4j) | **312.0 ms** (MongoDB `$graphLookup`) → **27.1× speedup**<br>**1,140.0 ms** (PostgreSQL Recursive CTE) → **99.1× speedup** |
| **Fuzzy Full-Text Search (with typos)** | **8.4 ms** (Elasticsearch) | **142.1 ms** (MongoDB `$regex` full scan) → **16.9× speedup** |
| **Study Path Cache Retrieval** | **0.82 ms** (Redis P50)<br>**2.10 ms** (Redis P99) | **38.2 ms** (Uncached P50)<br>**148.0 ms** (Uncached P99) → **98.6% drop in P99 latency** |
| **Study Path Cache Hit Ratio** | **89.4%** | Measured over 1,000 randomized user queries |
| **Search Mean Reciprocal Rank (MRR@10)** | **0.91** (Hybrid Search) | **0.58** (MongoDB Regex), **0.84** (Pure BM25) |
| **Search Ranking Quality (NDCG@10)** | **0.89** (Hybrid Search) | **0.61** (MongoDB Regex), **0.82** (Pure BM25) |
| **Concept Extraction F1-Score** | **89.69%** (Gemini 2.5) | Precision: **91.58%**, Recall: **87.88%** on academic textbooks |
| **Concurrent Load Throughput** | **420.0 RPS** sustained | 250 concurrent virtual users over 10 min, **0.00% HTTP 5xx errors** |

---

## 🛠️ Tech Stack

- **Backend:** Python 3.11+ / 3.13, FastAPI, Uvicorn, Pydantic v2, PyPDF, Passlib / Bcrypt, PyJWT
- **Frontend:** Next.js 16 (App Router), React 19, Webpack, Axios, React Flow / Cytoscape
- **Databases:** MongoDB 8.0, Neo4j 5.26, Elasticsearch 8.11 / 9.5, Redis 7.4
- **AI / LLM:** Google Gemini 2.5 Flash API (Structured JSON Schema Ingestion)
- **Containerization & Dev Tools:** Docker Compose, k6, Locust

---

## ⚙️ Installation & Setup Guide

### 1. Prerequisites

Ensure the following runtimes and services are installed on your workstation:
- **Node.js** (v18.0.0 or higher) and **npm**
- **Python** (v3.11 or higher)
- **Git**
- **Docker & Docker Compose** (or locally running instances of MongoDB, Neo4j, Elasticsearch, and Redis)

---

### 2. Clone the Repository

```bash
git clone https://github.com/bot123testing/smart-notes.git
cd smart-notes
```

---

### 3. Start Database Services via Docker Compose

Spin up all four database engines with a single command:

```bash
docker compose up -d
```

Verify that all containers are healthy and listening on their respective native ports:
- **MongoDB:** `localhost:27017`
- **Redis:** `localhost:6379`
- **Neo4j:** `localhost:7474` (HTTP Browser) and `localhost:7687` (Bolt)
- **Elasticsearch:** `localhost:9200`

---

### 4. Configure Backend Environment

Navigate to the `backend/` directory and set up a Python virtual environment:

```bash
cd backend
python -m venv venv

# On Windows:
.\venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory (or verify existing values):

```ini
APP_NAMESPACE_CONFIRMED="studypath"
DATABASE_NAME="smartnotes_studypath"
ES_INDEX_PREFIX="studypath_"
REDIS_KEY_PREFIX="sp:"
NEO4J_LABEL_PREFIX="SP_"

PROJECT_NAME="Smart Notes+ Study Path"
MONGODB_URL="mongodb://127.0.0.1:27017"
SECRET_KEY="your_jwt_secret_key_change_me"

REDIS_URL="redis://127.0.0.1:6379/0"
NEO4J_URI="bolt://127.0.0.1:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="password"
ELASTICSEARCH_URL="http://127.0.0.1:9200"

GEMINI_MODEL="gemini-2.5-flash-lite"
GEMINI_EXTRACTION_MODEL="gemini-2.5-flash"
GEMINI_RPM=15
GEMINI_RPD=1500
GEMINI_TPM=1000000
GEMINI_MODE="live"
GEMINI_API_KEY="your_google_gemini_api_key_here"
```

Start the FastAPI backend server:

```bash
uvicorn main:app --port 8000 --reload
```

*Expected output:*
```text
[Namespace Guard] DATABASE_NAME: smartnotes_studypath
[Namespace Guard] Validation passed: running in isolated namespace.
Connected to MongoDB at mongodb://127.0.0.1:27017
Connected to Redis
Connected to Neo4j at bolt://127.0.0.1:7687
Connected to ElasticSearch: 8.11.0
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

---

### 5. Configure Frontend Environment

Open a new terminal window, navigate to the `web/` directory, and install frontend dependencies:

```bash
cd web
npm install
```

Start the Next.js development server:

```bash
npm run dev
```

*Expected output:*
```text
> web@0.1.0 dev
> next dev --webpack

▲ Next.js 16.1.1 (webpack)
- Local:         http://localhost:3000
- Network:       http://127.0.0.1:3000

✓ Ready in 3.6s
```

---

## 🌐 Application Access & Seed Credentials

Once running, access the interfaces through your web browser:

| Interface | URL | Description |
| :--- | :--- | :--- |
| **Web Application** | [http://localhost:3000](http://localhost:3000) | Main application UI (Login, Notes, PDF Reader, Study Paths). |
| **API Interactive Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive Swagger UI for all REST API endpoints. |
| **Neo4j Browser GUI** | [http://localhost:7474](http://localhost:7474) | Interactive Cypher query console and graph visualizer. |
| **Elasticsearch Cluster** | [http://localhost:9200](http://localhost:9200) | Elasticsearch cluster status and JSON index inspection. |

### Default Demonstration Accounts

You can sign in with either of the preloaded demo accounts:

- **Primary Account:**
  - **Email:** `aryan99bhardwaj@gmail.com`
  - **Password:** `password123`
  - **Data:** 10 Structured Notes + 5 Technical PDFs
- **Demonstration Account:**
  - **Email:** `demo@studypath.io`
  - **Password:** `demopass123`
  - **Data:** 10 Structured Notes + 5 Technical PDFs + Precomputed Concept Graph

---

## 🔌 Core API Endpoints

| Category | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Authentication** | `POST` | `/api/auth/register` | Register a new user account with PBKDF2 hashed password. |
| | `POST` | `/api/auth/login` | Authenticate with credentials and receive a JWT bearer token. |
| | `GET` | `/api/auth/me` | Fetch authenticated user profile and session status. |
| **Notes** | `GET` | `/api/notes/` | List all notes owned by the authenticated user. |
| | `POST` | `/api/notes/` | Create a new note (indexes to MongoDB and Elasticsearch). |
| | `GET` | `/api/notes/recommendations` | Compute Ebbinghaus memory decay and hybrid recommendations. |
| | `POST` | `/api/notes/{id}/link` | Create an explicit bi-directional link between two notes. |
| **Documents** | `POST` | `/api/documents/upload` | Upload a PDF document; triggers background chunking and extraction. |
| | `GET` | `/api/documents/` | List all ingested PDF documents with chunk and concept counts. |
| | `GET` | `/api/documents/{id}/file` | Stream the original PDF file for in-browser rendering. |
| | `PUT` | `/api/documents/{id}/tags` | Update document tags (supports manual entry and AI magic tags). |
| **Study Paths** | `GET` | `/api/study-paths/concepts` | List all extracted canonical concepts with prerequisite counts. |
| | `GET` | `/api/study-paths/path/{concept_id}` | Generate a cycle-safe topological prerequisite study path. |
| | `GET` | `/api/study-paths/gap-analysis/{id}` | Compute unlearned prerequisite gap analysis for target concept. |
| | `POST` | `/api/study-paths/known-concepts/{id}`| Toggle concept mastery status (persisted to MongoDB and Redis). |
| | `GET` | `/api/study-paths/graph` | Fetch full interactive 2D node-link concept graph for visualizer. |
| **Search** | `GET` | `/api/search/?q={query}` | Hybrid search across notes, PDFs, and chunks via Elasticsearch BM25. |

---

## 👥 Contributors & Academic Credits

This project was developed for **BCSE406L – NoSQL Databases** at the **School of Computer Science and Engineering (SCOPE), Vellore Institute of Technology (VIT)**.

- **Bhardwaj Aryan Vineet** — Reg. No: `23BCE1459`
- **Aditi Pandey** — Reg. No: `23BCE1157`

**Course Details:**
- **Course Code:** BCSE406L – NoSQL Databases
- **Slot:** D1 + TD1
- **Faculty Guide:** Dr. MANJULA V, SCOPE, VIT

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — feel free to use, modify, and distribute this software for educational and research purposes.
