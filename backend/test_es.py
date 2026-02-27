import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from elasticsearch import AsyncElasticsearch

async def test():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["smartnotes"]
    user = await db["users"].find_one()  # get ANY actual user
    user_id = str(user["_id"])
    
    es = AsyncElasticsearch("http://localhost:9200")
    
    query = {
        "bool": {
            "must": [
                {
                    "multi_match": {
                        "query": "searchable",
                        "fields": ["title^2", "content", "tags^1.5"],
                        "fuzziness": "AUTO"
                    }
                }
            ],
            "filter": [
                {
                    "term": {
                        "owner_id": user_id
                    }
                }
            ]
        }
    }
    
    response = await es.search(index="notes", query=query, size=20)
    hits = response["hits"]["hits"]
    print(f"Hits with owner_id filter: {len(hits)}")
    for h in hits:
        print(h["_source"])

if __name__ == "__main__":
    asyncio.run(test())
