from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    id: str = Field(description="Unique model identifier, e.g. gpt-4o, claude-3-5-sonnet")
    name: str = Field(description="Display name for the model")
    provider: str = Field(description="Provider identifier: openai, anthropic, gemini")
    context_window: Optional[int] = Field(default=None, description="Context window size in tokens")
    is_default: bool = Field(default=False, description="Whether this is the recommended/default model")


class ProviderStatus(BaseModel):
    provider: str
    configured: bool
    models: List[ModelInfo] = Field(default_factory=list)


class UnifiedProviderStatusResponse(BaseModel):
    configured: bool = Field(description="True if at least one model provider key is configured")
    provider: Optional[str] = Field(default=None, description="Active provider (for Phase 1 backward compatibility)")
    active_provider: Optional[str] = Field(default=None, description="Default or active provider")
    active_model: Optional[str] = Field(default=None, description="Default model ID")
    available_models: List[ModelInfo] = Field(default_factory=list)
    providers: Dict[str, bool] = Field(default_factory=dict, description="Configuration status per provider")
    message: str = Field(description="Summary message")
