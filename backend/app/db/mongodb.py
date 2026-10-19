from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class Database:
    client: AsyncIOMotorClient = None

    async def connect(self):
        try:
            self.client = AsyncIOMotorClient(settings.MONGODB_URL)
            # Send a ping to confirm a successful connection
            await self.client.admin.command('ping')
            print(f"Connected to MongoDB at {settings.MONGODB_URL}")
            await self._init_indexes()
        except Exception as e:
            print(f"Could not connect to MongoDB: {e}")
            raise e

    async def _init_indexes(self):
        try:
            database = self.get_db()
            # 1. Documents: unique on (owner_id, file_sha256)
            await database["documents"].create_index(
                [("owner_id", 1), ("file_sha256", 1)],
                unique=True,
                name="uniq_owner_file_sha256"
            )
            # 2. Concepts: unique on (owner_id, normalized_name)
            await database["concepts"].create_index(
                [("owner_id", 1), ("normalized_name", 1)],
                unique=True,
                name="uniq_owner_concept_name"
            )
            # 3. Chunks: unique on (document_id, chunk_index)
            await database["chunks"].create_index(
                [("document_id", 1), ("chunk_index", 1)],
                unique=True,
                name="uniq_doc_chunk_index"
            )
            # 4. Concept Edges: unique on (owner_id, from_concept, to_concept, source_id)
            await database["concept_edges"].create_index(
                [("owner_id", 1), ("from_concept", 1), ("to_concept", 1), ("source_id", 1)],
                unique=True,
                name="uniq_owner_concept_edge"
            )
        except Exception as idx_err:
            print(f"[MongoDB Index Warning] {idx_err}")

    def disconnect(self):
        if self.client:
            self.client.close()
            print("Disconnected from MongoDB")

    def get_db(self):
        return self.client[settings.DATABASE_NAME]

db = Database()
