from pathlib import Path
from typing import Dict, Optional

from services.extractors.base import BaseExtractor, ExtractionResult
from services.extractors.csv_extractor import CsvExtractor
from services.extractors.docx_extractor import DocxExtractor
from services.extractors.pdf_extractor import PdfExtractor
from services.extractors.text_extractor import TextExtractor

_EXTRACTORS: Dict[str, BaseExtractor] = {
    "pdf": PdfExtractor(),
    "docx": DocxExtractor(),
    "txt": TextExtractor(),
    "md": TextExtractor(),
    "markdown": TextExtractor(),
    "csv": CsvExtractor(),
    # Code & configuration files
    "py": TextExtractor(),
    "ts": TextExtractor(),
    "tsx": TextExtractor(),
    "js": TextExtractor(),
    "jsx": TextExtractor(),
    "json": TextExtractor(),
    "yaml": TextExtractor(),
    "yml": TextExtractor(),
    "sql": TextExtractor(),
    "html": TextExtractor(),
    "css": TextExtractor(),
    "sh": TextExtractor(),
    "bat": TextExtractor(),
}

# Magic byte signatures for tamper/format verification
FILE_SIGNATURES = {
    "pdf": b"%PDF-",
    "docx": b"PK\x03\x04",
}


def get_normalized_extension(filename: str) -> str:
    """Extracts and normalizes the lowercase extension without dot."""
    ext = Path(filename).suffix.lower().lstrip(".")
    return ext


def is_supported_format(extension: str) -> bool:
    return extension.lower().lstrip(".") in _EXTRACTORS


def validate_file_signature(extension: str, content: bytes) -> bool:
    """Verifies file signature magic bytes when defined."""
    ext = extension.lower().lstrip(".")
    if ext in FILE_SIGNATURES:
        sig = FILE_SIGNATURES[ext]
        return content.startswith(sig)
    return True


def get_extractor(extension: str) -> Optional[BaseExtractor]:
    ext = extension.lower().lstrip(".")
    return _EXTRACTORS.get(ext)
