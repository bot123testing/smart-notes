import redis.asyncio as redis
import os

class RedisManager:
    client: redis.Redis = None

    async def connect(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            # protocol=2 ensures compatibility with Redis for Windows (3.0.x) by avoiding the 'HELLO' command
            self.client = redis.from_url(redis_url, decode_responses=True, protocol=2)
            await self.client.ping()
            print("Connected to Redis")
        except Exception as e:
            print(f"Redis connection failed: {e}")
            self.client = None

    async def disconnect(self):
        if self.client:
            await self.client.aclose()
            print("Disconnected from Redis")

    def get_redis(self) -> redis.Redis:
        return self.client

# Singleton instance
redis_client = RedisManager()
