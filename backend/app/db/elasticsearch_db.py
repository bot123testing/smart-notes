import os
import logging
from elasticsearch import AsyncElasticsearch
from app.core.config import settings

# Suppress elastic_transport/aiohttp internal noise
logging.getLogger("elastic_transport").setLevel(logging.ERROR)
logging.getLogger("elasticsearch").setLevel(logging.ERROR)


class ElasticSearchManager:
    client: AsyncElasticsearch = None

    async def connect(self):
        uri = settings.elasticsearch_url
        try:
            self.client = AsyncElasticsearch(uri)
            info = await self.client.info()
            print(f"Connected to ElasticSearch: {info['version']['number']}")
            await self._init_indices()
        except Exception:
            print("ElasticSearch unavailable — search will fall back to MongoDB.")
            if self.client:
                await self.client.close()
            self.client = None  # get_client() returns None → all if-client guards skip cleanly

    async def _init_indices(self):
        index_name = f"{settings.ES_INDEX_PREFIX}notes"
        exists = await self.client.indices.exists(index=index_name)
        if not exists:
            mapping = {
                "mappings": {
                    "properties": {
                        "id": {"type": "keyword"},
                        "owner_id": {"type": "keyword"},
                        "title": {"type": "text"},
                        "content": {"type": "text"},
                        "tags": {"type": "keyword"},
                    }
                }
            }
            await self.client.indices.create(index=index_name, body=mapping)
            print(f"Created ElasticSearch index '{index_name}' with mappings.")

        doc_index = f"{settings.ES_INDEX_PREFIX}documents"
        doc_exists = await self.client.indices.exists(index=doc_index)
        if not doc_exists:
            doc_mapping = {
                "mappings": {
                    "properties": {
                        "id": {"type": "keyword"},
                        "owner_id": {"type": "keyword"},
                        "filename": {"type": "text"},
                        "content": {"type": "text"},
                        "doc_type": {"type": "keyword"}
                    }
                }
            }
            await self.client.indices.create(index=doc_index, body=doc_mapping)
            print(f"Created ElasticSearch index '{doc_index}' with mappings.")

    async def disconnect(self):
        if self.client:
            await self.client.close()
            print("Disconnected from ElasticSearch")

    def get_client(self) -> AsyncElasticsearch:
        return self.client


# Singleton instance
elasticsearch_db = ElasticSearchManager()
