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

        auth = (user, password) if user and password else None

        # Retry up to 3 times to allow Neo4j cold-start warm-up
        for attempt in range(1, 4):
            _stderr = sys.stderr
            sys.stderr = StringIO()
            try:
                if auth:
                    self.driver = AsyncGraphDatabase.driver(uri, auth=auth)
                else:
                    self.driver = AsyncGraphDatabase.driver(uri)
                await self.driver.verify_connectivity()
                sys.stderr = _stderr
                print(f"Connected to Neo4j at {uri}")
                return
            except Exception:
                sys.stderr = _stderr
                if attempt < 3:
                    import asyncio
                    await asyncio.sleep(1.5)
                else:
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
