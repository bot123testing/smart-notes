import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings, verify_namespace_guard

def main():
    verify_namespace_guard()
    print(f"seed_demo: Guard confirmed. Database: {settings.DATABASE_NAME}, ES: {settings.ES_INDEX_PREFIX}, Redis: {settings.REDIS_KEY_PREFIX}, Neo4j: {settings.NEO4J_LABEL_PREFIX}")
    # Seeding logic will be expanded in later phases

if __name__ == "__main__":
    main()
