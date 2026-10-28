from fastapi import APIRouter, Depends, Query
from typing import List, Dict, Any
from app.models.user import User
from app.api.deps import get_current_user
from app.db.elasticsearch_db import elasticsearch_db
from app.db.mongodb import db
from app.core.config import settings
from bson import ObjectId
import re

router = APIRouter()


async def _mongo_search(q: str, user_id: str) -> List[Dict[str, Any]]:
    """Fallback: MongoDB regex search across notes and documents."""
    from app.api.endpoints.notes import _populate_links
    database = db.get_db()
    pattern = re.compile(re.escape(q), re.IGNORECASE)

    results = []

    # 1. Search Notes
    notes_cursor = database["notes"].find({
        "owner_id": user_id,
        "$or": [
            {"title": {"$regex": pattern}},
            {"content": {"$regex": pattern}},
            {"tags": {"$regex": pattern}},
        ],
    }).limit(20)
    notes = await notes_cursor.to_list(length=20)
    for n in notes:
        n_linked = await _populate_links(database, n)
        n_dict = n_linked.model_dump() if hasattr(n_linked, "model_dump") else dict(n_linked)
        n_dict["item_type"] = "note"
        results.append(n_dict)

    # 2. Search Documents (PDFs)
    docs_cursor = database["documents"].find({
        "owner_id": user_id,
        "$or": [
            {"filename": {"$regex": pattern}},
            {"tags": {"$regex": pattern}},
            {"extracted_concepts": {"$regex": pattern}},
        ],
    }).limit(20)
    docs = await docs_cursor.to_list(length=20)
    for d in docs:
        results.append({
            "id": str(d["_id"]),
            "title": d.get("filename", "Untitled PDF"),
            "content": d.get("description", ""),
            "tags": d.get("tags", []),
            "item_type": "document",
            "page_count": d.get("page_count", 0),
            "chunk_count": d.get("chunk_count", 0),
            "updated_at": d.get("updated_at")
        })

    return results


@router.get("", response_model=List[Dict[str, Any]])
async def search_knowledge_base(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user)
):
    """
    Full-text search across note titles, contents, tags, and PDF documents.
    Uses Elasticsearch BM25 + fuzzy typo tolerance when available,
    and falls back to MongoDB regex search.
    """
    client = elasticsearch_db.get_client()
    if not client:
        return await _mongo_search(q, current_user.id)

    results = []
    database = db.get_db()
    from app.api.endpoints.notes import _populate_links

    try:
        # 1. Search Notes Index in Elasticsearch
        note_query = {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": q,
                            "fields": ["title^3", "content", "tags^2"],
                            "fuzziness": "AUTO"
                        }
                    }
                ],
                "filter": [
                    {"term": {"owner_id": current_user.id}}
                ]
            }
        }
        note_res = await client.search(
            index=f"{settings.ES_INDEX_PREFIX}notes",
            query=note_query,
            size=20
        )
        note_hits = note_res.get("hits", {}).get("hits", [])

        note_oids = []
        for hit in note_hits:
            hit_id = hit["_id"]
            try:
                note_oids.append(ObjectId(hit_id))
            except Exception:
                pass

        if note_oids:
            notes_cursor = database["notes"].find({"_id": {"$in": note_oids}})
            notes_map = {str(n["_id"]): n async for n in notes_cursor}
            for hit in note_hits:
                hid = hit["_id"]
                if hid in notes_map:
                    doc = notes_map[hid]
                    n_linked = await _populate_links(database, doc)
                    n_dict = n_linked.model_dump() if hasattr(n_linked, "model_dump") else dict(n_linked)
                    n_dict["item_type"] = "note"
                    results.append(n_dict)

        # 2. Search Documents Index in Elasticsearch
        doc_query = {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": q,
                            "fields": ["filename^3", "content"],
                            "fuzziness": "AUTO"
                        }
                    }
                ],
                "filter": [
                    {"term": {"owner_id": current_user.id}}
                ]
            }
        }
        doc_res = await client.search(
            index=f"{settings.ES_INDEX_PREFIX}documents",
            query=doc_query,
            size=20
        )
        doc_hits = doc_res.get("hits", {}).get("hits", [])

        doc_oids = []
        for hit in doc_hits:
            hit_id = hit["_id"]
            try:
                doc_oids.append(ObjectId(hit_id))
            except Exception:
                pass

        if doc_oids:
            docs_cursor = database["documents"].find({"_id": {"$in": doc_oids}})
            docs_map = {str(d["_id"]): d async for d in docs_cursor}
            for hit in doc_hits:
                hid = hit["_id"]
                if hid in docs_map:
                    d = docs_map[hid]
                    results.append({
                        "id": str(d["_id"]),
                        "title": d.get("filename", "Untitled PDF"),
                        "content": d.get("description", ""),
                        "tags": d.get("tags", []),
                        "item_type": "document",
                        "page_count": d.get("page_count", 0),
                        "chunk_count": d.get("chunk_count", 0),
                        "updated_at": d.get("updated_at")
                    })

        return results

    except Exception as e:
        print(f"Elasticsearch query failed, falling back to MongoDB: {e}")
        return await _mongo_search(q, current_user.id)
