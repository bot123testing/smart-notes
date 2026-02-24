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
        except Exception as e:
            print(f"Could not connect to MongoDB: {e}")
            raise e

    def disconnect(self):
        if self.client:
            self.client.close()
            print("Disconnected from MongoDB")

    def get_db(self):
        return self.client[settings.DATABASE_NAME]

db = Database()
