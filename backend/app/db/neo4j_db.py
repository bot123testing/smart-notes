import os
import sys
import logging
from io import StringIO
from neo4j import AsyncGraphDatabase, AsyncDriver

# Suppress the neo4j driver's internal WARNING logs
logging.getLogger("neo4j").setLevel(logging.ERROR)
logging.getLogger("neo4j.io").setLevel(logging.ERROR)


from app.core.config import settings

class Neo4jManager:
    driver: AsyncDriver = None

    async def connect(self):
        uri = os.getenv("NEO4J_URI", getattr(settings, "neo4j_uri", "bolt://127.0.0.1:7687"))
        user = os.getenv("NEO4J_USER", getattr(settings, "neo4j_user", "neo4j"))
        password = os.getenv("NEO4J_PASSWORD", getattr(settings, "neo4j_password", "password"))

        _stderr = sys.stderr
        sys.stderr = StringIO()
        try:
            auth = (user, password) if user and password else None
            if auth:
                self.driver = AsyncGraphDatabase.driver(uri, auth=auth)
            else:
                self.driver = AsyncGraphDatabase.driver(uri)
            await self.driver.verify_connectivity()
            sys.stderr = _stderr
            print(f"Connected to Neo4j at {uri}")
        except Exception:
            try:
                # Fallback attempt without auth or alternative URI
                self.driver = AsyncGraphDatabase.driver(uri)
                await self.driver.verify_connectivity()
                sys.stderr = _stderr
                print(f"Connected to Neo4j at {uri}")
            except Exception:
                sys.stderr = _stderr
                print("Neo4j unavailable — graph features will be skipped.")
                if self.driver:
                    await self.driver.close()
                self.driver = None

    async def disconnect(self):
        if self.driver:
            await self.driver.close()
            print("Disconnected from Neo4j")

    def get_driver(self) -> AsyncDriver:
        return self.driver


# Singleton instance
neo4j_db = Neo4jManager()
