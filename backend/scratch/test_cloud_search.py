import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.mongodb import db
from app.db.elasticsearch_db import elasticsearch_db
from app.api.endpoints.search import search_knowledge_base
from app.models.user import User

async def main():
    await db.connect()
    await elasticsearch_db.connect()
    
    # Check all users
    users = await db.get_db()["users"].find().to_list(length=10)
    print(f"Total users found: {len(users)}")
    for u in users:
        print(f"Testing user: {u.get('email')} (ID: {u.get('_id')})")
        user = User(id=str(u["_id"]), email=u.get("email"), username=u.get("username", "test"))
        res = await search_knowledge_base("cloud", user)
        print(f"  Results for 'cloud': {len(res)}")
        for r in res:
            print(f"    - [{r.get('item_type')}] {r.get('title')}")

    # Check Elasticsearch documents index directly
    es = elasticsearch_db.get_client()
    if es:
        all_es_docs = await es.search(index="studypath_documents", query={"match_all": {}})
        print(f"\nAll docs in Elasticsearch 'studypath_documents' ({all_es_docs['hits']['total']['value']}):")
        for h in all_es_docs["hits"]["hits"]:
            print(f"  ID: {h['_id']} | File: {h['_source'].get('filename')} | Owner: {h['_source'].get('owner_id')}")

if __name__ == "__main__":
    asyncio.run(main())
