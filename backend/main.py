from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import auth, notes, activity, graph
from app.db.mongodb import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect to MongoDB
    await db.connect()
    yield
    # Shutdown: close MongoDB connection
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
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(activity.router, prefix="/api/activity", tags=["activity"])
app.include_router(graph.router, prefix="/api/notes", tags=["graph"])
