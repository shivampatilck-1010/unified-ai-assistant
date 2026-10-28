from abc import ABC, abstractmethod
import math
from typing import List, Optional
from config import get_settings


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0

    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))

    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class BaseEmbeddingProvider(ABC):
    @property
    @abstractmethod
    def provider_id(self) -> str:
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        pass

    @abstractmethod
    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        pass

    @abstractmethod
    async def generate_query_embedding(self, query: str) -> List[float]:
        pass


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key

    @property
    def provider_id(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not self.is_configured():
            raise RuntimeError("OpenAI embedding provider is not configured.")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)
        # Bounded batches
        batch_size = 32
        all_embeddings: List[List[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=batch,
            )
            for item in response.data:
                all_embeddings.append(item.embedding)

        return all_embeddings

    async def generate_query_embedding(self, query: str) -> List[float]:
        res = await self.generate_embeddings([query])
        return res[0]


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.gemini_api_key

    @property
    def provider_id(self) -> str:
        return "gemini"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not self.is_configured():
            raise RuntimeError("Gemini embedding provider is not configured.")
        from google import genai

        client = genai.Client(api_key=self.api_key)
        embeddings: List[List[float]] = []

        for text in texts:
            response = client.models.embed_content(
                model="text-embedding-004",
                contents=text,
            )
            embeddings.append(list(response.embedding.values))

        return embeddings

    async def generate_query_embedding(self, query: str) -> List[float]:
        res = await self.generate_embeddings([query])
        return res[0]


class MockEmbeddingProvider(BaseEmbeddingProvider):
    """Deterministic embedding provider for test environments without external API keys."""

    def __init__(self, dimension: int = 32):
        self.dimension = dimension

    @property
    def provider_id(self) -> str:
        return "mock"

    def is_configured(self) -> bool:
        return True

    def _hash_vector(self, text: str) -> List[float]:
        vec = [0.0] * self.dimension
        words = text.lower().split()
        for word in words:
            idx = sum(ord(c) for c in word) % self.dimension
            vec[idx] += 1.0

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        return [self._hash_vector(t) for t in texts]

    async def generate_query_embedding(self, query: str) -> List[float]:
        return self._hash_vector(query)


class UnconfiguredEmbeddingProvider(BaseEmbeddingProvider):
    @property
    def provider_id(self) -> str:
        return "none"

    def is_configured(self) -> bool:
        return False

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        raise RuntimeError("No embedding provider is configured.")

    async def generate_query_embedding(self, query: str) -> List[float]:
        raise RuntimeError("No embedding provider is configured.")


_custom_provider: Optional[BaseEmbeddingProvider] = None


def set_custom_embedding_provider(provider: Optional[BaseEmbeddingProvider]) -> None:
    global _custom_provider
    _custom_provider = provider


# Alias for test convenience
set_embedding_provider = set_custom_embedding_provider


def get_embedding_provider() -> BaseEmbeddingProvider:
    if _custom_provider is not None:
        return _custom_provider

    openai_p = OpenAIEmbeddingProvider()
    if openai_p.is_configured():
        return openai_p

    gemini_p = GeminiEmbeddingProvider()
    if gemini_p.is_configured():
        return gemini_p

    return UnconfiguredEmbeddingProvider()
