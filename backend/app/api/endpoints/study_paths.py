from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from app.models.user import User
from app.api.deps import get_current_user
from app.db.mongodb import db
from app.models.concept import ConceptResponse
from app.models.study_path import (
    StudyPathResponse,
    GapAnalysisResponse,
    ConceptGraphResponse,
    RelatedContentResponse,
    KnownConceptToggleResponse,
)
from app.services.study_path_service import (
    generate_study_path,
    generate_gap_analysis,
    get_concept_graph,
    get_related_content,
    toggle_known_concept,
    normalize_concept_id,
)

router = APIRouter()


@router.get("/concepts", response_model=List[ConceptResponse])
async def list_user_concepts(
    q: Optional[str] = Query(None, description="Search query by concept name"),
    current_user: User = Depends(get_current_user)
):
    """
    Lists all concepts extracted from current_user's documents and notes.
    """
    database = db.get_db()
    query = {"owner_id": current_user.id}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}

    cursor = database["concepts"].find(query).sort("mention_count", -1).limit(200)
    docs = await cursor.to_list(length=200)

    result = []
    for d in docs:
        d["id"] = str(d["_id"])
        result.append(ConceptResponse(**d))
    return result


@router.get("/path/{concept_id}", response_model=StudyPathResponse)
async def get_study_path_for_concept(
    concept_id: str,
    refresh: bool = Query(False, description="Bypass cache and force recomputation"),
    current_user: User = Depends(get_current_user)
):
    """
    Generates a cycle-safe, topologically ordered study path to master the target concept.
    Includes prerequisite depth, dependent concepts, and links to relevant documents/notes.
    """
    database = db.get_db()
    norm_id = normalize_concept_id(concept_id)

    # Verify concept exists or has edges
    c = await database["concepts"].find_one({"owner_id": current_user.id, "normalized_name": norm_id})
    edge = await database["concept_edges"].find_one({
        "owner_id": current_user.id,
        "$or": [{"from_concept": norm_id}, {"to_concept": norm_id}]
    })

    if not c and not edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Concept '{concept_id}' not found in your knowledge base."
        )

    return await generate_study_path(norm_id, current_user.id, database, refresh=refresh)


@router.get("/gap-analysis/{concept_id}", response_model=GapAnalysisResponse)
async def get_gap_analysis_for_concept(
    concept_id: str,
    refresh: bool = Query(False, description="Bypass cache and force recomputation"),
    current_user: User = Depends(get_current_user)
):
    """
    Answers 'What am I missing for concept X?'.
    Compares the full prerequisite tree against concepts the user has marked as known.
    """
    database = db.get_db()
    norm_id = normalize_concept_id(concept_id)

    c = await database["concepts"].find_one({"owner_id": current_user.id, "normalized_name": norm_id})
    edge = await database["concept_edges"].find_one({
        "owner_id": current_user.id,
        "$or": [{"from_concept": norm_id}, {"to_concept": norm_id}]
    })

    if not c and not edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Concept '{concept_id}' not found in your knowledge base."
        )

    return await generate_gap_analysis(norm_id, current_user.id, database, refresh=refresh)


@router.get("/graph", response_model=ConceptGraphResponse)
async def get_concept_network_graph(
    refresh: bool = Query(False, description="Bypass cache and force recomputation"),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the user's interactive knowledge network (Concepts, Documents, Notes, Edges)
    for UI visualization (vis.js, Cytoscape, ReactFlow).
    """
    database = db.get_db()
    return await get_concept_graph(current_user.id, database, refresh=refresh)


@router.post("/known-concepts/{concept_id}", response_model=KnownConceptToggleResponse)
async def mark_concept_as_known(
    concept_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Marks a concept as mastered/known by the student.
    """
    database = db.get_db()
    norm_id = normalize_concept_id(concept_id)
    await toggle_known_concept(norm_id, current_user.id, mark_known=True, database=database)
    return KnownConceptToggleResponse(
        concept_id=norm_id,
        is_known=True,
        message=f"Concept '{norm_id}' marked as known."
    )


@router.delete("/known-concepts/{concept_id}", response_model=KnownConceptToggleResponse)
async def unmark_concept_as_known(
    concept_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Removes a concept from the student's known list.
    """
    database = db.get_db()
    norm_id = normalize_concept_id(concept_id)
    await toggle_known_concept(norm_id, current_user.id, mark_known=False, database=database)
    return KnownConceptToggleResponse(
        concept_id=norm_id,
        is_known=False,
        message=f"Concept '{norm_id}' unmarked."
    )


@router.get("/known-concepts", response_model=List[str])
async def list_known_concepts(
    current_user: User = Depends(get_current_user)
):
    """
    Returns the list of normalized concept IDs known by the user.
    """
    database = db.get_db()
    cursor = database["user_known_concepts"].find({"owner_id": current_user.id})
    docs = await cursor.to_list(length=2000)
    return [d["concept_id"] for d in docs]


@router.get("/related", response_model=RelatedContentResponse)
async def get_related_items(
    source_id: str = Query(..., description="ID of the document or note"),
    source_type: str = Query("document", pattern="^(document|note)$"),
    current_user: User = Depends(get_current_user)
):
    """
    Returns related content using hybrid scoring (shared Neo4j concepts + Elasticsearch BM25).
    """
    database = db.get_db()
    return await get_related_content(source_id, source_type, current_user.id, database)
