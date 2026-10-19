import json
from datetime import datetime
from typing import List, Dict, Any
from bson import ObjectId
from app.models.metrics import NoteRecommendation, RecommendationsResponse
from app.db.neo4j_db import neo4j_db
from app.db.redis import redis_client
from app.core.config import settings

async def generate_hybrid_recommendations(database, user_id: str) -> RecommendationsResponse:
    """
    Generate hybrid recommendations using Context (Redis), Graph Relevance (Neo4j),
    and Spaced Repetition / Memory Decay (MongoDB).
    """
    # 1. Fetch Context (Recently viewed notes) from Redis
    r = redis_client.get_redis()
    recent_key = f"{settings.REDIS_KEY_PREFIX}user:{user_id}:recent_notes"
    recent_note_ids = await r.lrange(recent_key, 0, 4) # Get top 5 recent notes
    recent_note_ids = [rid for rid in recent_note_ids if rid]

    driver = neo4j_db.get_driver()
    candidate_scores = {} # note_id -> graph_score

    # 2. Fetch Graph Relevance from Neo4j
    if driver and recent_note_ids:
        # Perform a 1-2 hop traversal originating from ALL recently viewed notes simultaneously.
        # We value nodes that are connected to MULTIPLE recently viewed notes (high 'paths' count),
        # as well as nodes that are physically closer (shorter 'distance').
        query = f"""
        UNWIND $recent_ids AS start_id
        MATCH p = (start:{settings.NEO4J_LABEL_PREFIX}Note {{id: start_id}})-[*1..2]-(candidate:{settings.NEO4J_LABEL_PREFIX}Note {{owner_id: $owner_id}})
        WHERE NOT candidate.id IN $recent_ids
        WITH candidate, min(length(p)) AS min_dist, count(p) AS path_count
        // Score: closer distance is better, more paths to the context cluster is better
        RETURN candidate.id AS id, (path_count * 1.0) / min_dist AS graph_score
        ORDER BY graph_score DESC
        LIMIT 20
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, recent_ids=recent_note_ids, owner_id=user_id)
                records = await result.data()
                for rec in records:
                    candidate_scores[rec["id"]] = rec["graph_score"]
        except Exception as neo4j_err:
            print(f"[recommendations] Neo4j unavailable, skipping graph traversal: {neo4j_err}")
    
    # Fallback if no recent history or graph traversal yields nothing:
    # Just fetch the most connected nodes globally for this user.
    if driver and not candidate_scores:
        query = f"""
        MATCH (n:{settings.NEO4J_LABEL_PREFIX}Note {{owner_id: $owner_id}})-[r:RELATED_TO]-()
        WITH n, count(r) AS degree
        WHERE degree > 0
        RETURN n.id AS id, degree * 0.5 AS graph_score
        ORDER BY graph_score DESC
        LIMIT 20
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, owner_id=user_id)
                records = await result.data()
                for rec in records:
                    candidate_scores[rec["id"]] = rec["graph_score"]
        except Exception as neo4j_err:
            print(f"[recommendations] Neo4j unavailable, skipping fallback graph query: {neo4j_err}")

    # If still no candidates found through graph, fetch all notes from Mongo and score purely by decay.
    candidate_ids = list(candidate_scores.keys())

    # 3. Fetch Spaced Repetition Metrics from MongoDB
    metrics_query = {"user_id": user_id}
    if candidate_ids:
         metrics_query["note_id"] = {"$in": candidate_ids}

    metrics_docs = await database["knowledge_metrics"].find(metrics_query).to_list(length=50)
    metrics_by_note = {doc["note_id"]: doc for doc in metrics_docs}

    # If we didn't have graph candidates, use all notes returned from metrics
    if not candidate_ids:
        candidate_ids = list(metrics_by_note.keys())

    # 4. Final Scoring
    recommendations: List[NoteRecommendation] = []
    final_scores: Dict[str, float] = {}  # note_id -> hybrid score (for sorting)

    # We need titles. Fetch titles for candidates from `notes` collection.
    oids = []
    for cid in candidate_ids:
        try:
            oids.append(ObjectId(cid))
        except Exception:
            pass
            
    title_map = {}
    if oids:
        notes_cursor = database["notes"].find({"_id": {"$in": oids}}, {"_id": 1, "title": 1})
        async for doc in notes_cursor:
             title_map[str(doc["_id"])] = doc.get("title", "Untitled")

    for note_id in candidate_ids:
        m = metrics_by_note.get(note_id, {})
        if not m:
            continue # Skip if metrics haven't been computed yet
            
        decay = float(m.get("memory_decay", 0.0))
        importance = float(m.get("importance_score", 0.0))
        g_score = float(candidate_scores.get(note_id, 0.0))
        
        # Hybrid formula: Base recommendation heavily on graph relevance to current context,
        # but multiply by memory decay so we surface relevant things the user is forgetting.
        # We add 0.1 to decay so fresh notes (decay=0) still appear if graph relevance is huge.
        final_score = g_score * (decay + 0.1)
        
        # If no graph context exists, just sort purely by memory decay
        if final_score == 0:
             final_score = decay
             
        title = title_map.get(note_id, "Untitled")
        final_scores[note_id] = final_score

        recommendations.append(NoteRecommendation(
            note_id=note_id,
            title=title,
            importance_score=importance,
            access_count=m.get("access_count", 0),
            last_accessed=m.get("last_accessed"),
            memory_decay=decay,
            linked_note_count=0, # We skip populated link count for speed, graph_score implies it
        ))

    # Sort by hybrid final score descending
    recommendations.sort(key=lambda r: final_scores.get(r.note_id, 0), reverse=True)
    
    response = RecommendationsResponse(notes=recommendations, total=len(recommendations))
    
    # 5. Cache the full JSON response in Redis for 15 minutes (900s)
    cache_key = f"{settings.REDIS_KEY_PREFIX}user:{user_id}:recommendations"
    await r.setex(cache_key, 900, response.model_dump_json(by_alias=True))
    
    return response
