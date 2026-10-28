from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings, verify_namespace_guard
from app.api.endpoints import auth, notes, activity, graph, search, ai, documents, study_paths
from app.db.mongodb import db
from app.db.redis import redis_client
from app.db.neo4j_db import neo4j_db
from app.db.elasticsearch_db import elasticsearch_db
from app.services.pipeline_service import startup_recovery_sweep


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Namespace safety check: aborts if not running in isolated studypath namespace
    verify_namespace_guard()

    # Startup: connect to MongoDB, Redis, Neo4j, and ES
    await db.connect()
    await redis_client.connect()
    await neo4j_db.connect()
    await elasticsearch_db.connect()

    # Startup recovery sweep for incomplete or orphaned background tasks
    try:
        await startup_recovery_sweep(db.get_db())
    except Exception as e:
        print(f"[Startup Sweep Warning] {e}")

    yield
    # Shutdown: close all connections
    await elasticsearch_db.disconnect()
    await neo4j_db.disconnect()
    await redis_client.disconnect()
    db.disconnect()


app = FastAPI(title="Smart Notes+ API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for now (mobile + web)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to Smart Notes+ API"}

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(graph.router, prefix="/api/notes", tags=["graph"])   # must be before notes (has /{note_id} catch-all)
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(activity.router, prefix="/api/activity", tags=["activity"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(study_paths.router, prefix="/api/study-paths", tags=["study-paths"])


