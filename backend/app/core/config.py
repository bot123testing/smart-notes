import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Notes+"
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "smartnotes")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    redis_url: str = "redis://127.0.0.1:6379"
    neo4j_uri: str = "bolt://127.0.0.1:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    elasticsearch_url: str = "http://127.0.0.1:9200"
    ES_INDEX_PREFIX: str = os.getenv("ES_INDEX_PREFIX", "")
    REDIS_KEY_PREFIX: str = os.getenv("REDIS_KEY_PREFIX", "sp:")
    APP_NAMESPACE_CONFIRMED: str = os.getenv("APP_NAMESPACE_CONFIRMED", "studypath")
    NEO4J_LABEL_PREFIX: str = os.getenv("NEO4J_LABEL_PREFIX", "SP_")
    GEMINI_API_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
