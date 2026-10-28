from typing import List, Optional
from pydantic import BaseModel, Field


class ChunkCitation(BaseModel):
    file_id: str
    filename: str
    chunk_index: int
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    snippet: str
    score: Optional[float] = None


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Search query across indexed knowledge")
    file_ids: Optional[List[str]] = Field(None, description="Optional filter to specific files")
    top_k: int = Field(default=5, ge=1, le=20, description="Max chunk results to return")


class KnowledgeSearchResponse(BaseModel):
    query: str
    results: List[ChunkCitation]
    citations: List[ChunkCitation] = Field(default_factory=list)
    total_results: int
    strategy_used: str = Field(..., description="'semantic', 'lexical', or 'hybrid'")


class KnowledgeAnswerRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Question to answer using document knowledge")
    file_ids: Optional[List[str]] = Field(None, description="Optional target file IDs")
    provider: Optional[str] = Field(None, description="Target LLM provider (openai, anthropic, gemini)")
    model: Optional[str] = Field(None, description="Target LLM model ID")


class KnowledgeAnswerResponse(BaseModel):
    query: str
    answer: str
    citations: List[ChunkCitation]
    sufficient_evidence: bool
    strategy_used: str
