from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class StudyPathStep(BaseModel):
    step_number: int
    concept_id: str
    name: str
    description: Optional[str] = None
    depth: int = 0
    is_known: bool = False
    prerequisites: List[str] = Field(default_factory=list)
    dependent_concepts: List[str] = Field(default_factory=list)
    related_sources: List[Dict[str, Any]] = Field(default_factory=list)


class StudyPathResponse(BaseModel):
    target_concept_id: str
    target_concept_name: str
    total_steps: int
    known_steps_count: int
    missing_steps_count: int
    readiness_percentage: float
    has_cycle: bool = False
    cycle_warnings: List[str] = Field(default_factory=list)
    steps: List[StudyPathStep] = Field(default_factory=list)


class GapAnalysisResponse(BaseModel):
    target_concept_id: str
    target_concept_name: str
    total_prerequisites: int
    known_count: int
    missing_count: int
    readiness_percentage: float
    has_cycle: bool = False
    cycle_warnings: List[str] = Field(default_factory=list)
    known_prerequisites: List[Dict[str, Any]] = Field(default_factory=list)
    missing_prerequisites: List[StudyPathStep] = Field(default_factory=list)


class ConceptGraphNode(BaseModel):
    id: str
    label: str
    type: str  # "concept", "document", "note"
    is_known: bool = False
    mention_count: int = 0
    description: Optional[str] = None


class ConceptGraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "PREREQUISITE_OF", "MENTIONS"


class ConceptGraphResponse(BaseModel):
    nodes: List[ConceptGraphNode] = Field(default_factory=list)
    edges: List[ConceptGraphEdge] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class RelatedContentItem(BaseModel):
    id: str
    source_type: str  # "document", "note"
    title: str
    shared_concepts: List[str] = Field(default_factory=list)
    similarity_reason: str
    score: float = 0.0


class RelatedContentResponse(BaseModel):
    source_id: str
    source_type: str
    items: List[RelatedContentItem] = Field(default_factory=list)


class KnownConceptToggleResponse(BaseModel):
    concept_id: str
    is_known: bool
    message: str
