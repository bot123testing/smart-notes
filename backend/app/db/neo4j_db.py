import os
import sys
import logging
from io import StringIO
from neo4j import AsyncGraphDatabase, AsyncDriver

# Suppress the neo4j driver's internal WARNING logs
logging.getLogger("neo4j").setLevel(logging.ERROR)
logging.getLogger("neo4j.io").setLevel(logging.ERROR)


class Neo4jManager:
    driver: AsyncDriver = None

    async def connect(self):
        uri = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
        # Redirect stderr during connect to suppress the driver's internal
        # "Unable to retrieve routing information" print() calls
        _stderr = sys.stderr
        sys.stderr = StringIO()
        try:
            self.driver = AsyncGraphDatabase.driver(uri)
            await self.driver.verify_connectivity()
            sys.stderr = _stderr
            print("Connected to Neo4j")
        except Exception as e:
            sys.stderr = _stderr
            print("Neo4j unavailable — graph features will be skipped.")
            if self.driver:
                await self.driver.close()
            self.driver = None  # get_driver() returns None → all if-driver guards skip cleanly

    async def disconnect(self):
        if self.driver:
            await self.driver.close()
            print("Disconnected from Neo4j")

    def get_driver(self) -> AsyncDriver:
        return self.driver


# Singleton instance
neo4j_db = Neo4jManager()
