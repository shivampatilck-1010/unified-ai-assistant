import logging
from services.extractors.base import BaseExtractor, ExtractionResult

logger = logging.getLogger("text_extractor")


class TextExtractor(BaseExtractor):
    def extract(self, content_bytes: bytes, filename: str) -> ExtractionResult:
        # Try UTF-8 decoding first, then fallback to utf-8-sig and latin-1
        text = ""
        for encoding in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                text = content_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        cleaned = text.strip()
        pages = [(1, cleaned)] if cleaned else []
        return ExtractionResult(
            text=cleaned,
            page_count=1 if cleaned else 0,
            pages=pages,
        )
