"""
Database Inspector Script for Smart Notes+ Study Path Builder
Run this script from a normal terminal to instantly print live records
from MongoDB, Redis, and Neo4j without needing mongosh or redis-cli.
"""
import sys
import json
from pathlib import Path
from pprint import pprint

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
import pymongo
import redis

print("\n" + "="*70)
print("  SMART NOTES+ NOSQL DATABASE LIVE INSPECTOR")
print("="*70)

# ---------------------------------------------------------
# 1. MONGODB INSPECTION
# ---------------------------------------------------------
print("\n[1] MONGODB (Document Store on Port 27017)")
print(f"    Target Database: '{settings.DATABASE_NAME}'")
try:
    m_client = pymongo.MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
    m_db = m_client[settings.DATABASE_NAME]
    
    collections = m_db.list_collection_names()
    print(f"    Active Collections ({len(collections)}): {collections}")
    
    # Document counts
    print("\n    Entity Counts:")
    for col in ["documents", "chunks", "concepts", "concept_edges", "concept_mentions", "user_known_concepts", "notes"]:
        if col in collections:
            print(f"      - {col:<22}: {m_db[col].count_documents({})} records")
            
    # Sample documents
    docs = list(m_db["documents"].find({}, {"filename": 1, "page_count": 1, "chunk_count": 1, "tags": 1}).limit(3))
    if docs:
        print("\n    Sample Uploaded PDFs & Tags:")
        for d in docs:
            print(f"      * {d.get('filename')} (Pages: {d.get('page_count')}, Chunks: {d.get('chunk_count')})")
            print(f"        Tags: {d.get('tags', [])}")
            
    # Sample chunk
    chunk = m_db["chunks"].find_one({"chunk_index": 0})
    if chunk:
        print("\n    Sample 400-Word Chunk Provenance:")
        print(f"      * Document ID: {chunk.get('document_id')}")
        print(f"      * Extracted Concepts: {chunk.get('extracted_concepts', [])}")
        print(f"      * Text Snippet: {chunk.get('text', '')[:120]}...")
except Exception as e:
    print(f"    [MongoDB Error]: {e}")

# ---------------------------------------------------------
# 2. REDIS INSPECTION
# ---------------------------------------------------------
print("\n" + "-"*70)
print("[2] REDIS (In-Memory Key-Value Cache on Port 6379)")
print(f"    Key Prefix: '{settings.REDIS_KEY_PREFIX}'")
try:
    r_client = redis.Redis.from_url(settings.redis_url, decode_responses=True, protocol=2)
    keys = r_client.keys(f"{settings.REDIS_KEY_PREFIX}*")
    print(f"    Active Cached Keys ({len(keys)}):")
    if keys:
        for k in keys[:5]:
            ttl = r_client.ttl(k)
            k_type = r_client.type(k)
            print(f"      - Key : {k}")
            print(f"        Type: {k_type} | TTL Remaining: {ttl}s")
            if k_type == "string":
                val = r_client.get(k)
                print(f"        Val : {val[:90]}...")
    else:
        print("      (No cached keys right now. Open /study-path in the web app to generate instant cached keys!)")
except Exception as e:
    print(f"    [Redis Error]: {e}")

print("\n" + "="*70)
print("  INSPECTION COMPLETE")
print("="*70 + "\n")
