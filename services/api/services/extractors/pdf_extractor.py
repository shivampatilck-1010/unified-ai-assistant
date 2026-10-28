import io
import logging
from typing import List, Tuple
from services.extractors.base import BaseExtractor, ExtractionResult

logger = logging.getLogger("pdf_extractor")


class PdfExtractor(BaseExtractor):
    def extract(self, content_bytes: bytes, filename: str) -> ExtractionResult:
        try:
            import pypdf
        except ImportError as exc:
            raise RuntimeError("PDF extraction dependency 'pypdf' is not installed.") from exc

        try:
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            pages_extracted: List[Tuple[int, str]] = []
            full_text_parts: List[str] = []

            page_count = len(reader.pages)
            for idx, page in enumerate(reader.pages):
                page_num = idx + 1
                try:
                    page_text = page.extract_text() or ""
                except Exception as p_err:
                    logger.warning("Failed extracting text from page %d of %s: %s", page_num, filename, p_err)
                    page_text = ""

                cleaned = page_text.strip()
                if cleaned:
                    pages_extracted.append((page_num, cleaned))
                    full_text_parts.append(cleaned)

            full_text = "\n\n".join(full_text_parts)
            return ExtractionResult(
                text=full_text,
                page_count=page_count,
                pages=pages_extracted,
            )
        except Exception as exc:
            logger.error("PDF extraction failed for %s: %s", filename, exc)
            raise ValueError(f"Failed to parse PDF document: {str(exc)}") from exc
