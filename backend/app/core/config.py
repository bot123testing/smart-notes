import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ensure .env is explicitly loaded into os.environ regardless of current working directory
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

class Settings(BaseSettings):
    # Namespace safety settings
    APP_NAMESPACE_CONFIRMED: str = ""
    DATABASE_NAME: str = "smartnotes"
    ES_INDEX_PREFIX: str = ""
    REDIS_KEY_PREFIX: str = ""
    NEO4J_LABEL_PREFIX: str = ""

    PROJECT_NAME: str = "Smart Notes+"
    MONGODB_URL: str = "mongodb://localhost:27017"
    SECRET_KEY: str = "supersecretkey"
    ADMIN_SECRET_KEY: str | None = None
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    redis_url: str = "redis://127.0.0.1:6379/0"
    neo4j_uri: str = "bolt://127.0.0.1:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    elasticsearch_url: str = "http://127.0.0.1:9200"
    
    # Gemini configurations
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    GEMINI_EXTRACTION_MODEL: str = "gemini-2.5-flash"
    GEMINI_RPM: int = 15
    GEMINI_RPD: int = 1500
    GEMINI_TPM: int = 1000000
    GEMINI_MODE: str = "live"  # "live" | "replay"

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    model_config = SettingsConfigDict(
        env_file=str(env_path) if env_path.exists() else ".env",
        extra="ignore"
    )

settings = Settings()

def verify_namespace_guard():
    """
    Blocks application startup unless APP_NAMESPACE_CONFIRMED is 'studypath'
    and DATABASE_NAME is NOT 'smartnotes', guaranteeing no pollution of original data.
    Never logs secrets.
    """
    print(f"[Namespace Guard] DATABASE_NAME: {settings.DATABASE_NAME}")
    print(f"[Namespace Guard] ES_INDEX_PREFIX: '{settings.ES_INDEX_PREFIX}'")
    print(f"[Namespace Guard] REDIS_KEY_PREFIX: '{settings.REDIS_KEY_PREFIX}'")
    print(f"[Namespace Guard] NEO4J_LABEL_PREFIX: '{settings.NEO4J_LABEL_PREFIX}'")
    
    if (
        settings.APP_NAMESPACE_CONFIRMED != "studypath"
        or settings.DATABASE_NAME == "smartnotes"
        or not settings.ES_INDEX_PREFIX.strip()
        or not settings.REDIS_KEY_PREFIX.strip()
        or not settings.NEO4J_LABEL_PREFIX.strip()
    ):
        error_msg = (
            "FATAL: Namespace safety check failed! "
            "APP_NAMESPACE_CONFIRMED must be set to 'studypath', "
            "DATABASE_NAME must not be 'smartnotes', and "
            "ES_INDEX_PREFIX, REDIS_KEY_PREFIX, and NEO4J_LABEL_PREFIX must all be non-empty in .env."
        )
        print(f"[Namespace Guard ERROR] {error_msg}")
        raise RuntimeError(error_msg)
    print("[Namespace Guard] Validation passed: running in isolated namespace.")
