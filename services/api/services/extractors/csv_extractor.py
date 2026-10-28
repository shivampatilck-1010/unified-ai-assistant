import csv
import io
import logging
from services.extractors.base import BaseExtractor, ExtractionResult

logger = logging.getLogger("csv_extractor")


class CsvExtractor(BaseExtractor):
    def extract(self, content_bytes: bytes, filename: str) -> ExtractionResult:
        text_str = ""
        for encoding in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                text_str = content_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        reader = csv.reader(io.StringIO(text_str))
        formatted_rows = []
        for row in reader:
            non_empty = [c.strip() for c in row if c.strip()]
            if non_empty:
                formatted_rows.append(" | ".join(non_empty))

        full_text = "\n".join(formatted_rows)
        pages = [(1, full_text)] if full_text else []
        return ExtractionResult(
            text=full_text,
            page_count=1 if full_text else 0,
            pages=pages,
        )
