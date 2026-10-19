import redis.asyncio as redis
from app.core.config import settings

class RedisManager:
    client: redis.Redis = None

    async def connect(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True, protocol=2)
        print("Connected to Redis")

    async def disconnect(self):
        if self.client:
            await self.client.aclose()
            print("Disconnected from Redis")

    def get_redis(self) -> redis.Redis:
        return self.client

# Singleton instance
redis_client = RedisManager()
