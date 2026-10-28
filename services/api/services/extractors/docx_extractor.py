import io
import logging
from typing import List, Tuple
from services.extractors.base import BaseExtractor, ExtractionResult

logger = logging.getLogger("docx_extractor")


class DocxExtractor(BaseExtractor):
    def extract(self, content_bytes: bytes, filename: str) -> ExtractionResult:
        try:
            import docx
        except ImportError as exc:
            raise RuntimeError("DOCX extraction dependency 'python-docx' is not installed.") from exc

        try:
            doc = docx.Document(io.BytesIO(content_bytes))
            paragraphs: List[str] = []

            # 1. Paragraphs
            for p in doc.paragraphs:
                text = p.text.strip()
                if text:
                    paragraphs.append(text)

            # 2. Tables
            for table in doc.tables:
                for row in table.rows:
                    row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_cells:
                        paragraphs.append(" | ".join(row_cells))

            full_text = "\n\n".join(paragraphs)
            # DOCX does not naturally have hard page numbers in its XML, so treat as a continuous multi-section document
            pages = [(1, full_text)] if full_text else []

            return ExtractionResult(
                text=full_text,
                page_count=1 if full_text else 0,
                pages=pages,
            )
        except Exception as exc:
            logger.error("DOCX extraction failed for %s: %s", filename, exc)
            raise ValueError(f"Failed to parse DOCX document: {str(exc)}") from exc
