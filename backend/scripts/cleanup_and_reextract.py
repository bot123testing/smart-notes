import asyncio
from app.db.mongodb import db
from app.db.neo4j_db import neo4j_db
from app.core.config import settings
from app.services.concept_extraction_service import extract_concepts_from_text

JUNK_CONCEPTS = [
    'cloud', 'computing', 'service', 'their', 'transformed',
    'modern', 'information', 'organizations', 'digital'
]

async def run_cleanup():
    await db.connect()
    database = db.get_db()
    
    # 1. Delete junk from MongoDB
    del_c = await database['concepts'].delete_many({'normalized_name': {'$in': JUNK_CONCEPTS}})
    del_m = await database['concept_mentions'].delete_many({'normalized_name': {'$in': JUNK_CONCEPTS}})
    del_e = await database['concept_edges'].delete_many({
        '$or': [
            {'from_concept': {'$in': JUNK_CONCEPTS}},
            {'to_concept': {'$in': JUNK_CONCEPTS}}
        ]
    })
    print(f'Mongo cleanup: deleted {del_c.deleted_count} concepts, {del_m.deleted_count} mentions, {del_e.deleted_count} edges.')

    # 2. Delete junk from Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        try:
            async with driver.session() as session:
                for j in JUNK_CONCEPTS:
                    q = f'MATCH (c:{settings.NEO4J_LABEL_PREFIX}Concept {{id: $cid}}) DETACH DELETE c'
                    await session.run(q, cid=j)
            print('Neo4j cleanup completed.')
        except Exception as ne:
            print(f'Neo4j cleanup error: {ne}')

    # 3. Re-extract on all documents
    docs = await database['documents'].find({'status': 'ready'}).to_list(length=100)
    for doc in docs:
        doc_id = str(doc['_id'])
        owner_id = doc['owner_id']
        filename = doc.get('filename', 'Unknown PDF')
        chunks = await database['chunks'].find({'document_id': doc_id}).to_list(length=500)
        print(f'Re-extracting for doc {filename} ({len(chunks)} chunks)...')
        for ch in chunks:
            res = await extract_concepts_from_text(
                text=ch['text'],
                owner_id=owner_id,
                source_id=doc_id,
                source_type='document',
                chunk_id=str(ch['_id']),
                database=database
            )
            created_names = res.get('extracted_concept_names', [])
            await database['chunks'].update_one(
                {'_id': ch['_id']},
                {'$set': {'extracted_concepts': created_names}}
            )
            print(f'  Chunk {ch.get("chunk_index")} -> extracted: {created_names}')

    print('Cleanup and re-extraction complete!')

if __name__ == '__main__':
    asyncio.run(run_cleanup())
