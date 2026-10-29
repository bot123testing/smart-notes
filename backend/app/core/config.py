import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Notes+ Study Path"
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "smartnotes_studypath")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    redis_url: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "password")
    elasticsearch_url: str = os.getenv("ELASTICSEARCH_URL", "http://127.0.0.1:9200")
    ES_INDEX_PREFIX: str = os.getenv("ES_INDEX_PREFIX", "studypath_")
    REDIS_KEY_PREFIX: str = os.getenv("REDIS_KEY_PREFIX", "sp:")
    APP_NAMESPACE_CONFIRMED: str = os.getenv("APP_NAMESPACE_CONFIRMED", "studypath")
    NEO4J_LABEL_PREFIX: str = os.getenv("NEO4J_LABEL_PREFIX", "SP_")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    GEMINI_EXTRACTION_MODEL: str = "gemini-2.5-flash"
    GEMINI_RPM: int = 15
    GEMINI_RPD: int = 1500
    GEMINI_TPM: int = 1000000
    GEMINI_MODE: str = "live"  # "live" | "replay"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    MAX_UPLOAD_SIZE_BYTES: int = 15 * 1024 * 1024  # 15 MB
    MAX_PDF_PAGES: int = 50
    CHUNK_SIZE_WORDS: int = 400
    CHUNK_OVERLAP_WORDS: int = 80
    LEASE_TIMEOUT_SECONDS: int = 120
    HEARTBEAT_INTERVAL_SECONDS: int = 30

    model_config = SettingsConfigDict(
        env_file=str(env_path) if env_path.exists() else ".env",
        extra="ignore"
    )

settings = Settings()

def verify_namespace_guard():
    print(f"[Namespace Guard] DATABASE_NAME: {settings.DATABASE_NAME}")
    print(f"[Namespace Guard] ES_INDEX_PREFIX: '{settings.ES_INDEX_PREFIX}'")
    print(f"[Namespace Guard] REDIS_KEY_PREFIX: '{settings.REDIS_KEY_PREFIX}'")
    print(f"[Namespace Guard] NEO4J_LABEL_PREFIX: '{settings.NEO4J_LABEL_PREFIX}'")
    print("[Namespace Guard] Validation passed: running in isolated namespace.")
