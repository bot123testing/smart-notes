import os
import sys
import logging
from io import StringIO
from neo4j import AsyncGraphDatabase, AsyncDriver
from app.core.config import settings

# Suppress the neo4j driver's internal WARNING logs
logging.getLogger("neo4j").setLevel(logging.ERROR)
logging.getLogger("neo4j.io").setLevel(logging.ERROR)


class Neo4jManager:
    driver: AsyncDriver = None

    async def connect(self):
        uri = settings.neo4j_uri
        auth = (settings.neo4j_user, settings.neo4j_password)
        # Redirect stderr during connect to suppress the driver's internal
        # "Unable to retrieve routing information" print() calls
        _stderr = sys.stderr
        sys.stderr = StringIO()
        try:
            self.driver = AsyncGraphDatabase.driver(uri, auth=auth)
            await self.driver.verify_connectivity()
            sys.stderr = _stderr
            print("Connected to Neo4j")
            await self._init_constraints()
        except Exception as e:
            sys.stderr = _stderr
            print(f"Neo4j unavailable — graph features will be skipped: {e}")
            if self.driver:
                await self.driver.close()
            self.driver = None  # get_driver() returns None → all if-driver guards skip cleanly

    async def _init_constraints(self):
        prefix = settings.NEO4J_LABEL_PREFIX
        queries = [
            f"CREATE CONSTRAINT IF NOT EXISTS FOR (u:{prefix}User) REQUIRE u.id IS UNIQUE",
            f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{prefix}Note) REQUIRE n.id IS UNIQUE",
            f"CREATE CONSTRAINT IF NOT EXISTS FOR (d:{prefix}Document) REQUIRE d.id IS UNIQUE",
            f"CREATE CONSTRAINT IF NOT EXISTS FOR (c:{prefix}Concept) REQUIRE (c.owner_id, c.id) IS UNIQUE",
        ]
        async with self.driver.session() as session:
            for q in queries:
                try:
                    await session.run(q)
                except Exception as e:
                    print(f"[Neo4j constraint warning] {e}")

    init_constraints = _init_constraints

    async def disconnect(self):
        if self.driver:
            await self.driver.close()
            print("Disconnected from Neo4j")

    def get_driver(self) -> AsyncDriver:
        return self.driver


# Singleton instance
neo4j_db = Neo4jManager()
