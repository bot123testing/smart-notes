import json
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Set, Tuple
from bson import ObjectId

from app.core.config import settings
from app.db.mongodb import db
from app.db.neo4j_db import neo4j_db
from app.db.redis import redis_client
from app.db.elasticsearch_db import elasticsearch_db
from app.models.study_path import (
    StudyPathStep,
    StudyPathResponse,
    GapAnalysisResponse,
    ConceptGraphNode,
    ConceptGraphEdge,
    ConceptGraphResponse,
    RelatedContentItem,
    RelatedContentResponse,
)


# -------------------------------------------------------------------------
# Helper Functions: Normalization & Cycle-Safe Topological Sort
# -------------------------------------------------------------------------

def normalize_concept_id(name: str) -> str:
    from app.services.concept_extraction_service import normalize_concept_name
    return normalize_concept_name(name)


def detect_and_break_cycles(
    nodes: Set[str],
    adj: Dict[str, Set[str]]
) -> Tuple[Dict[str, Set[str]], List[str]]:
    """
    Detects directed cycles in the prerequisite graph using 3-color DFS.
    Breaks any back-edges found so that the resulting graph is a true DAG.
    Returns:
      (cleaned_adj, list_of_cycle_warnings)
    """
    clean_adj: Dict[str, Set[str]] = {u: set(adj.get(u, set())) for u in nodes}
    warnings: List[str] = []

    # 0 = UNVISITED, 1 = VISITING, 2 = VISITED
    color: Dict[str, int] = {u: 0 for u in nodes}
    parent_path: List[str] = []

    def dfs(u: str):
        color[u] = 1
        parent_path.append(u)

        for v in list(clean_adj.get(u, set())):
            if color.get(v, 0) == 1:
                # Cycle detected! u -> v is a back-edge
                cycle_idx = parent_path.index(v)
                cycle_str = " -> ".join(parent_path[cycle_idx:] + [v])
                warnings.append(f"Cycle detected and broken: {cycle_str}")
                clean_adj[u].remove(v)
            elif color.get(v, 0) == 0:
                dfs(v)

        parent_path.pop()
        color[u] = 2

    for node in list(nodes):
        if color.get(node, 0) == 0:
            dfs(node)

    return clean_adj, warnings


def topological_sort_dag(
    nodes: Set[str],
    adj: Dict[str, Set[str]]
) -> List[str]:
    """
    Executes Kahn's algorithm on a guaranteed DAG (cycles already broken).
    An edge u -> v means 'u is a prerequisite of v' (u must be studied before v).
    Therefore, in-degree in Kahn's algorithm is based on incoming prerequisite edges.
    """
    in_degree: Dict[str, int] = {u: 0 for u in nodes}
    for u in nodes:
        for v in adj.get(u, set()):
            if v in in_degree:
                in_degree[v] += 1

    queue = deque([u for u in nodes if in_degree[u] == 0])
    ordered: List[str] = []

    while queue:
        u = queue.popleft()
        ordered.append(u)
        for v in adj.get(u, set()):
            if v in in_degree:
                in_degree[v] -= 1
                if in_degree[v] == 0:
                    queue.append(v)

    # Any remaining nodes (should not happen if cycle breaking ran)
    remaining = [n for n in nodes if n not in ordered]
    ordered.extend(remaining)
    return ordered


# -------------------------------------------------------------------------
# Study Path & Prerequisite Traversal
# -------------------------------------------------------------------------

async def get_prerequisite_subgraph(
    target_id: str,
    owner_id: str,
    database
) -> Tuple[Set[str], Dict[str, Set[str]], Dict[str, Set[str]]]:
    """
    Finds all transitive prerequisite nodes for target_id scoped by owner_id.
    Returns:
      (subgraph_nodes, forward_adj (prereq -> dependent), reverse_adj (dependent -> prereq))
    Uses Neo4j if available, with authoritative fallback to MongoDB concept_edges.
    """
    nodes: Set[str] = {target_id}
    forward_adj: Dict[str, Set[str]] = defaultdict(set)
    reverse_adj: Dict[str, Set[str]] = defaultdict(set)

    # 1. Try Neo4j variable-length path traversal
    driver = neo4j_db.get_driver()
    neo4j_success = False

    if driver:
        query = f"""
        MATCH (target:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id, id: $target_id}})
        OPTIONAL MATCH path = (prereq:{settings.NEO4J_LABEL_PREFIX}Concept {{owner_id: $owner_id}})-[:PREREQUISITE_OF*1..10]->(target)
        WITH target, relationships(path) AS rels, nodes(path) AS pnodes
        RETURN [n IN pnodes | n.id] AS path_ids
        """
        try:
            async with driver.session() as session:
                res = await session.run(query, owner_id=owner_id, target_id=target_id)
                records = await res.data()
                for rec in records:
                    p_ids = rec.get("path_ids") or []
                    for i in range(len(p_ids)):
                        nodes.add(p_ids[i])
                        if i < len(p_ids) - 1:
                            u, v = p_ids[i], p_ids[i + 1]
                            forward_adj[u].add(v)
                            reverse_adj[v].add(u)
                neo4j_success = True
        except Exception as ne:
            print(f"[Study Path] Neo4j traversal warning: {ne}. Falling back to MongoDB.")

    # 2. Authoritative Fallback: MongoDB concept_edges
    if not neo4j_success or len(nodes) <= 1:
        cursor = database["concept_edges"].find({"owner_id": owner_id})
        all_edges = await cursor.to_list(length=2000)

        # Build full reverse map: dependent -> list of prerequisites
        full_rev: Dict[str, Set[str]] = defaultdict(set)
        full_fwd: Dict[str, Set[str]] = defaultdict(set)
        for e in all_edges:
            f = e.get("from_concept")
            t = e.get("to_concept")
            if f and t:
                full_fwd[f].add(t)
                full_rev[t].add(f)

        # BFS backwards from target_id to find all required prerequisites
        q = deque([target_id])
        visited = {target_id}
        while q:
            curr = q.popleft()
            for prereq in full_rev.get(curr, set()):
                forward_adj[prereq].add(curr)
                reverse_adj[curr].add(prereq)
                if prereq not in visited:
                    visited.add(prereq)
                    nodes.add(prereq)
                    q.append(prereq)

    return nodes, forward_adj, reverse_adj


async def generate_study_path(
    target_concept: str,
    owner_id: str,
    database,
    refresh: bool = False
) -> StudyPathResponse:
    """
    Generates a cycle-safe, topologically ordered study path to master target_concept.
    Uses Redis cache when available unless refresh=True.
    """
    target_id = normalize_concept_id(target_concept)
    cache_key = f"{settings.REDIS_KEY_PREFIX}user:{owner_id}:study_path:{target_id}"
    r = redis_client.get_redis()

    if r and not refresh:
        try:
            cached = await r.get(cache_key)
            if cached:
                data = json.loads(cached)
                return StudyPathResponse(**data)
        except Exception as re:
            print(f"[Redis StudyPath Cache Warning] {re}")

    # 1. Fetch prerequisite subgraph
    nodes, fwd_adj, rev_adj = await get_prerequisite_subgraph(target_id, owner_id, database)

    # 2. Detect and break cycles
    clean_fwd, cycle_warnings = detect_and_break_cycles(nodes, fwd_adj)
    has_cycle = len(cycle_warnings) > 0

    # 3. Topological ordering
    ordered_ids = topological_sort_dag(nodes, clean_fwd)

    # 4. Fetch concept metadata and user known concepts from Mongo
    concept_docs = await database["concepts"].find(
        {"owner_id": owner_id, "normalized_name": {"$in": list(nodes)}}
    ).to_list(length=1000)
    meta_map = {c["normalized_name"]: c for c in concept_docs}

    known_docs = await database["user_known_concepts"].find(
        {"owner_id": owner_id, "concept_id": {"$in": list(nodes)}}
    ).to_list(length=1000)
    known_set = {k["concept_id"] for k in known_docs}

    # Fetch mentions (documents and notes) for these concepts
    mentions_docs = await database["concept_mentions"].find(
        {"owner_id": owner_id, "normalized_name": {"$in": list(nodes)}}
    ).to_list(length=2000)

    # Resolve source titles for rich study path deep linking
    doc_oids = []
    note_oids = []
    for m in mentions_docs:
        sid = m.get("source_id")
        if sid and ObjectId.is_valid(sid):
            if m.get("source_type") == "document":
                doc_oids.append(ObjectId(sid))
            elif m.get("source_type") == "note":
                note_oids.append(ObjectId(sid))

    doc_titles = {}
    if doc_oids:
        docs = await database["documents"].find({"_id": {"$in": doc_oids}}, {"filename": 1, "title": 1}).to_list(length=1000)
        for d in docs:
            doc_titles[str(d["_id"])] = d.get("filename") or d.get("title") or "PDF Document"

    note_titles = {}
    if note_oids:
        notes = await database["notes"].find({"_id": {"$in": note_oids}}, {"title": 1}).to_list(length=1000)
        for n in notes:
            note_titles[str(n["_id"])] = n.get("title") or "Text Note"

    mentions_map = defaultdict(list)
    for m in mentions_docs:
        sid = m["source_id"]
        stype = m.get("source_type", "document")
        title = doc_titles.get(sid, "PDF Document") if stype == "document" else note_titles.get(sid, "Text Note")
        mentions_map[m["normalized_name"]].append({
            "source_id": sid,
            "source_type": stype,
            "title": title,
            "chunk_id": m.get("chunk_id"),
            "snippet": m.get("snippet", "")
        })

    # Compute depths (distance from root prerequisites)
    depths: Dict[str, int] = {u: 0 for u in ordered_ids}
    for u in ordered_ids:
        for v in clean_fwd.get(u, set()):
            if v in depths:
                depths[v] = max(depths[v], depths[u] + 1)

    steps: List[StudyPathStep] = []
    known_count = 0

    for idx, cid in enumerate(ordered_ids, 1):
        c_meta = meta_map.get(cid, {})
        display_name = c_meta.get("name") or cid.replace("_", " ").title()
        desc = c_meta.get("description")
        is_known = cid in known_set
        if is_known:
            known_count += 1

        direct_prereqs = list(rev_adj.get(cid, set()))
        direct_dependents = list(clean_fwd.get(cid, set()))

        step = StudyPathStep(
            step_number=idx,
            concept_id=cid,
            name=display_name,
            description=desc,
            depth=depths.get(cid, 0),
            is_known=is_known,
            prerequisites=direct_prereqs,
            dependent_concepts=direct_dependents,
            related_sources=mentions_map.get(cid, [])[:5]
        )
        steps.append(step)

    target_meta = meta_map.get(target_id, {})
    target_name = target_meta.get("name") or target_concept

    total_steps = len(steps)
    missing_count = total_steps - known_count
    readiness = (known_count / total_steps * 100.0) if total_steps > 0 else 0.0

    response = StudyPathResponse(
        target_concept_id=target_id,
        target_concept_name=target_name,
        total_steps=total_steps,
        known_steps_count=known_count,
        missing_steps_count=missing_count,
        readiness_percentage=round(readiness, 1),
        has_cycle=has_cycle,
        cycle_warnings=cycle_warnings,
        steps=steps
    )

    # Cache in Redis with 300s TTL
    if r:
        try:
            await r.setex(cache_key, 300, response.model_dump_json())
        except Exception as re:
            print(f"[Redis StudyPath Cache Set Warning] {re}")

    return response


# -------------------------------------------------------------------------
# Gap Analysis ("What am I missing?")
# -------------------------------------------------------------------------

async def generate_gap_analysis(
    target_concept: str,
    owner_id: str,
    database,
    refresh: bool = False
) -> GapAnalysisResponse:
    """
    Computes which prerequisites are still missing for the target concept.
    """
    study_path = await generate_study_path(target_concept, owner_id, database, refresh=refresh)

    known_list = []
    missing_steps = []

    for step in study_path.steps:
        if step.is_known:
            known_list.append({
                "concept_id": step.concept_id,
                "name": step.name,
                "description": step.description
            })
        else:
            missing_steps.append(step)

    return GapAnalysisResponse(
        target_concept_id=study_path.target_concept_id,
        target_concept_name=study_path.target_concept_name,
        total_prerequisites=study_path.total_steps,
        known_count=study_path.known_steps_count,
        missing_count=study_path.missing_steps_count,
        readiness_percentage=study_path.readiness_percentage,
        has_cycle=study_path.has_cycle,
        cycle_warnings=study_path.cycle_warnings,
        known_prerequisites=known_list,
        missing_prerequisites=missing_steps
    )


# -------------------------------------------------------------------------
# Concept Graph Network View (For UI Visualizer)
# -------------------------------------------------------------------------

async def get_concept_graph(
    owner_id: str,
    database,
    refresh: bool = False
) -> ConceptGraphResponse:
    """
    Builds the full interactive concept graph (Concepts, Documents, Notes, Edges)
    scoped by owner_id for graph visualization libraries (Cytoscape / Vis / ReactFlow).
    """
    cache_key = f"{settings.REDIS_KEY_PREFIX}user:{owner_id}:concept_graph"
    r = redis_client.get_redis()
    if r and not refresh:
        try:
            cached = await r.get(cache_key)
            if cached:
                return ConceptGraphResponse(**json.loads(cached))
        except Exception:
            pass

    # 1. Fetch user's known concepts
    known_docs = await database["user_known_concepts"].find({"owner_id": owner_id}).to_list(length=2000)
    known_set = {k["concept_id"] for k in known_docs}

    # 2. Fetch concepts
    concept_docs = await database["concepts"].find({"owner_id": owner_id}).to_list(length=1000)
    nodes: List[ConceptGraphNode] = []
    node_ids: Set[str] = set()

    for c in concept_docs:
        cid = c["normalized_name"]
        nodes.append(ConceptGraphNode(
            id=f"concept_{cid}",
            label=c.get("name", cid),
            type="concept",
            is_known=(cid in known_set),
            mention_count=c.get("mention_count", 1),
            description=c.get("description")
        ))
        node_ids.add(f"concept_{cid}")

    # 3. Fetch documents
    doc_docs = await database["documents"].find({"owner_id": owner_id}).to_list(length=500)
    for d in doc_docs:
        did = str(d["_id"])
        nodes.append(ConceptGraphNode(
            id=f"doc_{did}",
            label=d.get("filename", "PDF Document"),
            type="document",
            description=f"{d.get('page_count', 1)} pages, status: {d.get('status')}"
        ))
        node_ids.add(f"doc_{did}")

    # 4. Fetch notes
    note_docs = await database["notes"].find({"owner_id": owner_id}).to_list(length=500)
    for n in note_docs:
        nid = str(n["_id"])
        nodes.append(ConceptGraphNode(
            id=f"note_{nid}",
            label=n.get("title", "Text Note"),
            type="note",
            description=n.get("content", "")[:100]
        ))
        node_ids.add(f"note_{nid}")

    # 5. Fetch edges (Prerequisites & Mentions)
    edges: List[ConceptGraphEdge] = []
    edge_seen: Set[Tuple[str, str, str]] = set()

    # Concept -> Concept Prerequisites
    edge_docs = await database["concept_edges"].find({"owner_id": owner_id}).to_list(length=2000)
    for e in edge_docs:
        src = f"concept_{e['from_concept']}"
        tgt = f"concept_{e['to_concept']}"
        if src in node_ids and tgt in node_ids and (src, tgt, "PREREQUISITE_OF") not in edge_seen:
            edges.append(ConceptGraphEdge(source=src, target=tgt, type="PREREQUISITE_OF"))
            edge_seen.add((src, tgt, "PREREQUISITE_OF"))

    # Document/Note -> Concept Mentions
    mention_docs = await database["concept_mentions"].find({"owner_id": owner_id}).to_list(length=3000)
    for m in mention_docs:
        src_prefix = "doc" if m.get("source_type") == "document" else "note"
        src = f"{src_prefix}_{m['source_id']}"
        tgt = f"concept_{m['normalized_name']}"
        if tgt not in node_ids:
            c_name = m.get("concept_name") or m["normalized_name"].replace("_", " ").title()
            nodes.append(ConceptGraphNode(
                id=tgt,
                label=c_name,
                type="concept",
                is_known=(m["normalized_name"] in known_set),
                mention_count=1,
                description=None
            ))
            node_ids.add(tgt)

        if src in node_ids and tgt in node_ids and (src, tgt, "MENTIONS") not in edge_seen:
            edges.append(ConceptGraphEdge(source=src, target=tgt, type="MENTIONS"))
            edge_seen.add((src, tgt, "MENTIONS"))

    stats = {
        "total_concepts": len(concept_docs),
        "total_documents": len(doc_docs),
        "total_notes": len(note_docs),
        "total_prerequisite_edges": len([e for e in edges if e.type == "PREREQUISITE_OF"]),
        "total_mentions_edges": len([e for e in edges if e.type == "MENTIONS"])
    }

    response = ConceptGraphResponse(nodes=nodes, edges=edges, stats=stats)
    if r:
        try:
            await r.setex(cache_key, 300, response.model_dump_json())
        except Exception:
            pass

    return response


# -------------------------------------------------------------------------
# Hybrid Related Content Engine (Shared Graph Concepts + Elasticsearch)
# -------------------------------------------------------------------------

async def get_related_content(
    source_id: str,
    source_type: str,
    owner_id: str,
    database
) -> RelatedContentResponse:
    """
    Computes related content combining:
      1. Neo4j/Mongo Concept graph sharing (Items sharing extracted concepts).
      2. Elasticsearch text similarity (BM25 more_like_this).
    Provides clear, explainable similarity reasons for each recommendation.
    """
    # 1. Identify concepts mentioned in source
    source_mentions = await database["concept_mentions"].find(
        {"owner_id": owner_id, "source_id": source_id}
    ).to_list(length=200)

    source_concept_norms = list({m["normalized_name"] for m in source_mentions})

    # Fetch candidate items sharing concepts
    shared_candidates: Dict[Tuple[str, str], Set[str]] = defaultdict(set)  # (item_id, item_type) -> set of concepts

    if source_concept_norms:
        other_mentions = await database["concept_mentions"].find({
            "owner_id": owner_id,
            "normalized_name": {"$in": source_concept_norms},
            "source_id": {"$ne": source_id}
        }).to_list(length=1000)

        for om in other_mentions:
            key = (om["source_id"], om["source_type"])
            shared_candidates[key].add(om.get("concept_name") or om["normalized_name"])

    # 2. Text similarity via Elasticsearch
    es_scores: Dict[Tuple[str, str], float] = defaultdict(float)
    es_client = elasticsearch_db.get_client()

    # Get source text snippet
    source_text = ""
    if source_type == "document":
        doc_obj = await database["documents"].find_one({"_id": ObjectId(source_id)}) if ObjectId.is_valid(source_id) else None
        if doc_obj:
            source_text = doc_obj.get("filename", "")
            first_chunk = await database["chunks"].find_one({"document_id": source_id})
            if first_chunk:
                source_text += " " + first_chunk.get("text", "")[:300]
    else:
        note_obj = await database["notes"].find_one({"_id": ObjectId(source_id)}) if ObjectId.is_valid(source_id) else None
        if note_obj:
            source_text = f"{note_obj.get('title', '')} {note_obj.get('content', '')}"

    if es_client and source_text.strip():
        try:
            # Query documents
            doc_idx = f"{settings.ES_INDEX_PREFIX}documents"
            doc_res = await es_client.search(
                index=doc_idx,
                query={
                    "bool": {
                        "must": [{"match": {"content": {"query": source_text[:200]}}}],
                        "filter": [{"term": {"owner_id": owner_id}}],
                        "must_not": [{"term": {"id": source_id}}]
                    }
                },
                size=5
            )
            for hit in doc_res.get("hits", {}).get("hits", []):
                h_id = hit["_source"]["id"]
                es_scores[(h_id, "document")] = float(hit.get("_score", 1.0))
        except Exception as es_err:
            print(f"[ES Document Similarity Warning] {es_err}")

        try:
            # Query notes
            notes_idx = f"{settings.ES_INDEX_PREFIX}notes"
            notes_res = await es_client.search(
                index=notes_idx,
                query={
                    "bool": {
                        "must": [{"multi_match": {"query": source_text[:200], "fields": ["title^2", "content"]}}],
                        "filter": [{"term": {"owner_id": owner_id}}],
                        "must_not": [{"term": {"_id": source_id}}]
                    }
                },
                size=5
            )
            for hit in notes_res.get("hits", {}).get("hits", []):
                h_id = hit["_id"]
                es_scores[(h_id, "note")] = float(hit.get("_score", 1.0))
        except Exception as es_err2:
            print(f"[ES Notes Similarity Warning] {es_err2}")

    # 3. Combine scores & generate explainable items
    all_keys = set(shared_candidates.keys()).union(set(es_scores.keys()))
    items: List[RelatedContentItem] = []

    for (item_id, item_type) in all_keys:
        shared_list = sorted(list(shared_candidates.get((item_id, item_type), set())))
        es_score = es_scores.get((item_id, item_type), 0.0)
        graph_score = len(shared_list) * 2.5
        total_score = round(graph_score + es_score, 2)

        # Lookup title
        title = "Related Content"
        if item_type == "document":
            d = await database["documents"].find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else None
            if d:
                title = d.get("filename", "PDF Document")
        else:
            n = await database["notes"].find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else None
            if n:
                title = n.get("title", "Text Note")

        reasons = []
        if shared_list:
            reasons.append(f"Shares concept(s): {', '.join(shared_list[:3])}")
        if es_score > 0:
            reasons.append(f"Text match score {round(es_score, 1)}")

        explanation = " & ".join(reasons) if reasons else "Contextually related"

        items.append(RelatedContentItem(
            id=item_id,
            source_type=item_type,
            title=title,
            shared_concepts=shared_list,
            similarity_reason=explanation,
            score=total_score
        ))

    items.sort(key=lambda x: x.score, reverse=True)
    return RelatedContentResponse(
        source_id=source_id,
        source_type=source_type,
        items=items[:10]
    )


# -------------------------------------------------------------------------
# Known Concepts & Cache Invalidation
# -------------------------------------------------------------------------

async def toggle_known_concept(
    concept_id: str,
    owner_id: str,
    mark_known: bool,
    database
) -> bool:
    """
    Toggles a concept as known/unknown in MongoDB and invalidates related caches.
    """
    cid = normalize_concept_id(concept_id)
    if mark_known:
        await database["user_known_concepts"].update_one(
            {"owner_id": owner_id, "concept_id": cid},
            {"$set": {"owner_id": owner_id, "concept_id": cid, "marked_at": datetime.now(timezone.utc)}},
            upsert=True
        )
    else:
        await database["user_known_concepts"].delete_one({"owner_id": owner_id, "concept_id": cid})

    await invalidate_user_study_cache(owner_id)
    return mark_known


async def invalidate_user_study_cache(owner_id: str):
    """
    Clears cached study paths, gap analysis, and concept graph for owner_id in Redis.
    """
    r = redis_client.get_redis()
    if not r:
        return
    try:
        prefix = f"{settings.REDIS_KEY_PREFIX}user:{owner_id}:"
        keys_to_del = [
            f"{prefix}concept_graph"
        ]
        # In Redis 3+, delete known keys
        for k in keys_to_del:
            await r.delete(k)
        # Scan for study_path keys
        cur = b"0"
        while True:
            cur, keys = await r.scan(cur, match=f"{prefix}study_path:*", count=50)
            if keys:
                await r.delete(*keys)
            if cur == b"0" or cur == 0:
                break
    except Exception as e:
        print(f"[Redis StudyPath Invalidate Warning] {e}")
