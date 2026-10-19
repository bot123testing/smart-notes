from fastapi import APIRouter, Depends, Query
from typing import List
from app.models.note import Note
from app.models.user import User
from app.api.deps import get_current_user
from app.db.elasticsearch_db import elasticsearch_db
from app.db.mongodb import db
from app.core.config import settings
from bson import ObjectId
import re

router = APIRouter()


async def _mongo_search(q: str, user_id: str) -> List[Note]:
    """Fallback: simple MongoDB regex search across title, content, and tags."""
    from app.api.endpoints.notes import _populate_links
    database = db.get_db()
    pattern = re.compile(re.escape(q), re.IGNORECASE)
    cursor = database["notes"].find({
        "owner_id": user_id,
        "$or": [
            {"title": {"$regex": pattern}},
            {"content": {"$regex": pattern}},
            {"tags": {"$regex": pattern}},
        ],
    }).limit(20)
    notes = await cursor.to_list(length=20)
    return [await _populate_links(database, n) for n in notes]


@router.get("", response_model=List[Note])
async def search_notes(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user)
):
    """
    Full-text search across note titles, contents, and tags.
    Uses ElasticSearch when available, falls back to MongoDB regex search.
    """
    client = elasticsearch_db.get_client()
    if not client:
        return await _mongo_search(q, current_user.id)

    # Build the ElasticSearch query
    query = {
        "bool": {
            "must": [
                {
                    "multi_match": {
                        "query": q,
                        "fields": ["title^2", "content", "tags^1.5"],
                        "fuzziness": "AUTO"
                    }
                }
            ],
            "filter": [
                {
                    "term": {
                        "owner_id": current_user.id
                    }
                }
            ]
        }
    }

    try:
        response = await client.search(index=f"{settings.ES_INDEX_PREFIX}notes", query=query, size=20)
        hits = response["hits"]["hits"]
        
        hit_ids = []
        for hit in hits:
            source = hit["_source"]
            if "id" in source:
                hit_ids.append(source["id"])
                
        if not hit_ids:
            return []
            
        from app.api.endpoints.notes import _populate_links
        
        oids = []
        for hid in hit_ids:
            try:
                oids.append(ObjectId(hid))
            except Exception:
                pass
                
        database = db.get_db()
        notes_cursor = database["notes"].find({"_id": {"$in": oids}})
        notes_map = {str(n["_id"]): n async for n in notes_cursor}
        
        ordered_notes = []
        for hid in hit_ids:
            if hid in notes_map:
                doc = notes_map[hid]
                ordered_notes.append(await _populate_links(database, doc))
                
        return ordered_notes

    except Exception as e:
        print(f"ElasticSearch query failed, falling back to MongoDB: {e}")
        return await _mongo_search(q, current_user.id)

