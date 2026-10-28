from abc import ABC, abstractmethod
import hashlib
import os
from pathlib import Path
from typing import Optional

from config import get_settings


class FileStorageBackend(ABC):
    """Abstract file storage backend interface."""

    @abstractmethod
    def save_file(self, owner_id: str, file_id: str, extension: str, content: bytes) -> str:
        """Saves file bytes and returns the internal storage path identifier."""
        pass

    @abstractmethod
    def read_file(self, storage_path: str) -> bytes:
        """Reads and returns the stored file bytes."""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Deletes the stored file bytes if present."""
        pass

    @abstractmethod
    def file_exists(self, storage_path: str) -> bool:
        """Checks if the stored file exists."""
        pass


class LocalFileStorageBackend(FileStorageBackend):
    """Secure local filesystem storage backend with path traversal prevention."""

    def __init__(self, base_dir: Optional[str] = None):
        settings = get_settings()
        self.base_dir = Path(base_dir or settings.storage_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_owner_dir(self, owner_id: str) -> Path:
        # Obfuscate owner_id with sha256 to ensure safe directory names
        owner_hash = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:16]
        owner_dir = (self.base_dir / owner_hash).resolve()
        owner_dir.mkdir(parents=True, exist_ok=True)
        return owner_dir

    def _resolve_safe_path(self, storage_path: str) -> Path:
        # Prevent path traversal attacks
        clean_rel = os.path.normpath(storage_path).lstrip("/\\")
        resolved = (self.base_dir / clean_rel).resolve()
        if not str(resolved).startswith(str(self.base_dir)):
            raise ValueError("Path traversal attempt detected.")
        return resolved

    def save_file(self, owner_id: str, file_id: str, extension: str, content: bytes) -> str:
        owner_dir = self._get_owner_dir(owner_id)
        safe_ext = extension.lstrip(".").lower()
        # Clean ext of any unsafe chars
        safe_ext = "".join(c for c in safe_ext if c.isalnum())
        file_name = f"{file_id}.{safe_ext}" if safe_ext else file_id

        target_path = (owner_dir / file_name).resolve()
        if not str(target_path).startswith(str(self.base_dir)):
            raise ValueError("Target path escapes storage directory.")

        with open(target_path, "wb") as f:
            f.write(content)

        # Return relative path from base_dir
        return str(target_path.relative_to(self.base_dir)).replace("\\", "/")

    def read_file(self, storage_path: str) -> bytes:
        resolved = self._resolve_safe_path(storage_path)
        if not resolved.is_file():
            raise FileNotFoundError(f"Stored file not found: {storage_path}")
        with open(resolved, "rb") as f:
            return f.read()

    def delete_file(self, storage_path: str) -> bool:
        try:
            resolved = self._resolve_safe_path(storage_path)
            if resolved.is_file():
                resolved.unlink()
                return True
            return False
        except Exception:
            return False

    def file_exists(self, storage_path: str) -> bool:
        try:
            resolved = self._resolve_safe_path(storage_path)
            return resolved.is_file()
        except Exception:
            return False


_storage_instance: Optional[FileStorageBackend] = None


def get_storage_backend() -> FileStorageBackend:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalFileStorageBackend()
    return _storage_instance
