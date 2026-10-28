from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class ExtractionResult:
    text: str
    page_count: Optional[int] = None
    pages: List[Tuple[int, str]] = field(default_factory=list)  # (1-based page_number, page_text)


class BaseExtractor(ABC):
    """Abstract base extractor interface for document formats."""

    @abstractmethod
    def extract(self, content_bytes: bytes, filename: str) -> ExtractionResult:
        """Extracts text content and page/section provenance from file bytes."""
        pass
