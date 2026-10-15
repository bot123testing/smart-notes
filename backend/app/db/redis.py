import redis.asyncio as redis
import os

class RedisManager:
    client: redis.Redis = None

    async def connect(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.client = redis.from_url(redis_url, decode_responses=True)
        print("Connected to Redis")

    async def disconnect(self):
        if self.client:
            await self.client.aclose()
            print("Disconnected from Redis")

    def get_redis(self) -> redis.Redis:
        return self.client

# Singleton instance
redis_client = RedisManager()
