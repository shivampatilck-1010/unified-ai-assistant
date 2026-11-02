import csv
import json
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("browser_worker.file_intelligence")


class FileIntelligenceEngine:
    """Manages file downloads, content inspection (PDF, CSV, TXT, JSON), data extraction, and safe uploads."""

    def __init__(self, base_storage_dir: Optional[str] = None):
        if base_storage_dir:
            self.base_dir = Path(base_storage_dir)
        else:
            self.base_dir = Path(__file__).resolve().parent.parent / "api" / "data" / "storage"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_user_storage_dir(self, owner_id: str) -> Path:
        """Returns isolated directory for an owner, preventing cross-tenant leakage."""
        user_dir = self.base_dir / owner_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def save_downloaded_file(
        self,
        download: Any,
        owner_id: str,
        custom_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Saves a Playwright download into isolated user storage and returns metadata."""
        user_dir = self.get_user_storage_dir(owner_id)
        suggested_name = custom_name or download.suggested_filename or f"download_{uuid.uuid4().hex[:8]}"
        # Sanitize filename
        safe_name = "".join(c for c in suggested_name if c.isalnum() or c in "._- ")
        if not safe_name:
            safe_name = f"download_{uuid.uuid4().hex[:8]}"

        file_id = str(uuid.uuid4())
        dest_path = user_dir / f"{file_id}_{safe_name}"

        await download.save_as(str(dest_path))
        file_size = dest_path.stat().st_size
        mime_type = self._detect_mime_type(safe_name)

        logger.info(
            "[FILE_INTEL] Downloaded file saved: '%s' (%s bytes, type: %s) for user %s",
            safe_name,
            file_size,
            mime_type,
            owner_id,
        )

        # Automatically inspect content
        inspection = self.inspect_file(str(dest_path), mime_type)

        return {
            "id": file_id,
            "filename": safe_name,
            "file_path": str(dest_path),
            "file_size_bytes": file_size,
            "mime_type": mime_type,
            "summary": inspection.get("summary", ""),
            "extracted_text": inspection.get("extracted_text", ""),
            "line_count": inspection.get("line_count", 0),
            "created_at": inspection.get("timestamp", ""),
        }

    def inspect_file(self, file_path_str: str, mime_type: Optional[str] = None) -> Dict[str, Any]:
        """Inspects PDF, CSV, spreadsheet, or text document and extracts structured data."""
        p = Path(file_path_str)
        if not p.exists():
            return {"error": f"File '{file_path_str}' not found."}

        detected_mime = mime_type or self._detect_mime_type(p.name)

        if "pdf" in detected_mime or p.suffix.lower() == ".pdf":
            return self._inspect_pdf(p)
        elif "csv" in detected_mime or p.suffix.lower() in (".csv", ".tsv"):
            return self._inspect_csv(p)
        elif "json" in detected_mime or p.suffix.lower() == ".json":
            return self._inspect_json(p)
        else:
            return self._inspect_plain_text(p)

    def _inspect_pdf(self, path: Path) -> Dict[str, Any]:
        """Extracts text, page count, and metadata from a PDF file."""
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            num_pages = len(reader.pages)
            extracted_pages: List[str] = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    extracted_pages.append(f"--- Page {i + 1} ---\n{text.strip()}")

            full_text = "\n\n".join(extracted_pages)
            snippet = full_text[:1000] if len(full_text) > 1000 else full_text
            summary = f"PDF Document with {num_pages} pages. Extracted {len(full_text)} characters."

            return {
                "type": "pdf",
                "pages": num_pages,
                "summary": summary,
                "extracted_text": snippet,
                "full_text_length": len(full_text),
            }
        except Exception as e:
            logger.error("Failed to parse PDF %s: %s", path, e)
            return {
                "type": "pdf",
                "error": f"PDF parse error: {e}",
                "summary": f"Could not extract text from PDF: {e}",
            }

    def _inspect_csv(self, path: Path) -> Dict[str, Any]:
        """Parses CSV/TSV spreadsheets, extracting headers, row count, and preview records."""
        try:
            delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
            rows: List[List[str]] = []
            with open(path, mode="r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f, delimiter=delimiter)
                for i, row in enumerate(reader):
                    if i < 50:  # Preview up to 50 rows
                        rows.append(row)
                    elif i > 10000:
                        break

            headers = rows[0] if rows else []
            preview_rows = rows[1:10] if len(rows) > 1 else []
            total_rows = len(rows) - 1 if len(rows) > 0 else 0

            summary = f"Spreadsheet with {len(headers)} columns and ~{total_rows} rows. Columns: {', '.join(headers[:8])}"
            snippet = f"Headers: {headers}\nSample rows (first 3):\n" + "\n".join(str(r) for r in preview_rows[:3])

            return {
                "type": "tabular",
                "headers": headers,
                "row_count": total_rows,
                "preview_rows": preview_rows,
                "summary": summary,
                "extracted_text": snippet,
            }
        except Exception as e:
            logger.error("Failed to parse CSV %s: %s", path, e)
            return {
                "type": "tabular",
                "error": f"CSV parse error: {e}",
                "summary": f"Could not inspect CSV: {e}",
            }

    def _inspect_json(self, path: Path) -> Dict[str, Any]:
        """Inspects JSON structured data."""
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
            if isinstance(data, list):
                summary = f"JSON Array containing {len(data)} items."
            elif isinstance(data, dict):
                summary = f"JSON Object with keys: {list(data.keys())[:10]}"
            else:
                summary = "JSON Primitive value."

            snippet = json.dumps(data, indent=2)[:1000]
            return {
                "type": "json",
                "summary": summary,
                "extracted_text": snippet,
            }
        except Exception as e:
            return {"type": "json", "error": str(e), "summary": f"JSON parse error: {e}"}

    def _inspect_plain_text(self, path: Path) -> Dict[str, Any]:
        """Inspects standard text/markdown files."""
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            lines = text.splitlines()
            summary = f"Text document with {len(lines)} lines and {len(text)} characters."
            snippet = text[:1000] if len(text) > 1000 else text
            return {
                "type": "text",
                "summary": summary,
                "extracted_text": snippet,
                "line_count": len(lines),
            }
        except Exception as e:
            return {"type": "text", "error": str(e), "summary": f"Text read error: {e}"}

    def transform_and_save_data(
        self,
        owner_id: str,
        data: Any,
        filename: str,
        format_type: str = "json",
    ) -> Dict[str, Any]:
        """Generates a transformed report or tabular data export and saves to user storage."""
        user_dir = self.get_user_storage_dir(owner_id)
        file_id = str(uuid.uuid4())
        dest = user_dir / f"{file_id}_{filename}"

        if format_type == "json":
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        elif format_type in ("csv", "tsv"):
            delimiter = "\t" if format_type == "tsv" else ","
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                headers = list(data[0].keys())
                with open(dest, "w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=headers, delimiter=delimiter)
                    writer.writeheader()
                    writer.writerows(data)
            elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                with open(dest, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f, delimiter=delimiter)
                    writer.writerows(data)
        else:
            with open(dest, "w", encoding="utf-8") as f:
                f.write(str(data))

        file_size = dest.stat().st_size
        return {
            "id": file_id,
            "filename": filename,
            "file_path": str(dest),
            "file_size_bytes": file_size,
            "mime_type": self._detect_mime_type(filename),
            "summary": f"Generated {format_type.upper()} file with {file_size} bytes.",
        }

    def _detect_mime_type(self, filename: str) -> str:
        ext = Path(filename).suffix.lower()
        mapping = {
            ".pdf": "application/pdf",
            ".csv": "text/csv",
            ".tsv": "text/tab-separated-values",
            ".json": "application/json",
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".html": "text/html",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        return mapping.get(ext, "application/octet-stream")
