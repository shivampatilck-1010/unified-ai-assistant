import asyncio
from datetime import datetime, timezone
import hashlib
import json
import logging
import mimetypes
from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import async_session_factory
from models.document_chunk import DocumentChunk
from models.file_record import FileRecord
from services.chunking import chunk_extracted_document
from services.embeddings import get_embedding_provider
from services.extractors import (
    get_extractor,
    get_normalized_extension,
    is_supported_format,
    validate_file_signature,
)
from services.file_storage import get_storage_backend

logger = logging.getLogger("file_service")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FileService:
    @staticmethod
    async def upload_file(
        db: AsyncSession,
        owner_id: str,
        filename: str,
        content: bytes,
    ) -> FileRecord:
        settings = get_settings()

        # 1. Size limit validation
        file_size = len(content)
        if file_size == 0:
            raise ValueError("Uploaded file is empty.")
        if file_size > settings.max_upload_size_bytes:
            raise ValueError(
                f"File size ({file_size / (1024 * 1024):.1f} MB) exceeds maximum allowed size ({settings.max_upload_size_bytes / (1024 * 1024):.0f} MB)."
            )

        # 2. Quota check
        count_stmt = select(func.count(FileRecord.id), func.coalesce(func.sum(FileRecord.file_size), 0)).where(
            FileRecord.owner_id == owner_id
        )
        quota_res = await db.execute(count_stmt)
        user_file_count, user_total_bytes = quota_res.one()

        if user_file_count >= settings.max_user_file_count:
            raise ValueError(f"User file count quota exceeded (maximum {settings.max_user_file_count} files).")

        if user_total_bytes + file_size > settings.max_user_storage_bytes:
            raise ValueError(
                f"User storage quota exceeded (limit: {settings.max_user_storage_bytes / (1024 * 1024):.0f} MB)."
            )

        # 3. Safe filename & format validation
        clean_filename = Path(filename).name.strip()
        if not clean_filename or clean_filename.startswith("."):
            clean_filename = "document" + Path(filename).suffix

        ext = get_normalized_extension(clean_filename)
        if not ext or not is_supported_format(ext):
            raise ValueError(
                f"Unsupported file format '.{ext}'. Supported formats: PDF, DOCX, TXT, MD, CSV, and common source files."
            )

        # 4. File signature check
        if not validate_file_signature(ext, content):
            raise ValueError(f"File contents do not match the expected signature for '.{ext}' format.")

        mime_type, _ = mimetypes.guess_type(clean_filename)
        mime_type = mime_type or "application/octet-stream"

        # 5. Content hash
        content_hash = hashlib.sha256(content).hexdigest()

        # Check for existing duplicate file for this owner
        dup_stmt = select(FileRecord).where(
            FileRecord.owner_id == owner_id,
            FileRecord.content_hash == content_hash,
            FileRecord.status == "ready",
        )
        dup = (await db.execute(dup_stmt)).scalars().first()
        if dup:
            logger.info("Found existing identical upload %s for owner %s", dup.id, owner_id)
            # Create a clean record referencing storage or return existing
            # We create a new metadata record with the same storage path to support multiple files with same content
            storage_path = dup.storage_path
        else:
            storage = get_storage_backend()
            import uuid
            file_uuid = str(uuid.uuid4())
            storage_path = storage.save_file(owner_id, file_uuid, ext, content)

        import uuid
        new_id = str(uuid.uuid4())
        file_rec = FileRecord(
            id=new_id,
            owner_id=owner_id,
            filename=clean_filename,
            file_type=ext,
            mime_type=mime_type,
            file_size=file_size,
            content_hash=content_hash,
            storage_path=storage_path,
            status="uploaded",
        )
        db.add(file_rec)
        await db.commit()
        await db.refresh(file_rec)

        # Process file (extract -> chunk -> embed -> index)
        try:
            await FileService.process_file(new_id)
            await db.refresh(file_rec)
        except Exception as exc:
            logger.error("Initial processing failed for %s: %s", new_id, exc)

        return file_rec

    @staticmethod
    async def process_file(file_id: str) -> None:
        """Asynchronously processes a file: extract -> chunk -> embed -> index."""
        async with async_session_factory() as db:
            file_rec = await db.get(FileRecord, file_id)
            if not file_rec:
                return

            file_rec.status = "processing"
            file_rec.error_message = None
            file_rec.updated_at = utc_now()
            await db.commit()

            try:
                storage = get_storage_backend()
                content_bytes = storage.read_file(file_rec.storage_path)

                extractor = get_extractor(file_rec.file_type)
                if not extractor:
                    raise ValueError(f"No extractor registered for file type '{file_rec.file_type}'")

                # Bounded extraction
                extraction_res = extractor.extract(content_bytes, file_rec.filename)
                settings = get_settings()
                if len(extraction_res.text) > settings.max_extraction_chars:
                    extraction_res.text = extraction_res.text[: settings.max_extraction_chars]

                # Chunking
                chunks = chunk_extracted_document(extraction_res)

                # Generate embeddings if provider is configured
                embed_provider = get_embedding_provider()
                embeddings: List[Optional[str]] = [None] * len(chunks)

                if embed_provider.is_configured() and chunks:
                    try:
                        chunk_texts = [c.content for c in chunks]
                        raw_vectors = await embed_provider.generate_embeddings(chunk_texts)
                        embeddings = [json.dumps(vec) for vec in raw_vectors]
                    except Exception as e:
                        logger.warning("Embedding generation failed, falling back to lexical indexing: %s", e)

                # Remove existing chunks if reprocessing
                await db.execute(delete(DocumentChunk).where(DocumentChunk.file_id == file_id))

                # Insert chunk records
                for chunk_data, emb_json in zip(chunks, embeddings):
                    chunk_rec = DocumentChunk(
                        file_id=file_id,
                        owner_id=file_rec.owner_id,
                        chunk_index=chunk_data.chunk_index,
                        page_number=chunk_data.page_number,
                        section_title=chunk_data.section_title,
                        content=chunk_data.content,
                        token_count=chunk_data.token_count,
                        embedding=emb_json,
                    )
                    db.add(chunk_rec)

                file_rec.status = "ready"
                file_rec.chunk_count = len(chunks)
                file_rec.page_count = extraction_res.page_count
                file_rec.updated_at = utc_now()
                await db.commit()
                logger.info("Successfully processed file %s into %d chunks", file_id, len(chunks))

            except Exception as exc:
                logger.error("Processing failed for file %s: %s", file_id, exc, exc_info=True)
                file_rec.status = "failed"
                # Record safe sanitized error without leaking internal paths
                file_rec.error_message = f"Processing error: {str(exc).split(str(get_settings().storage_dir))[-1]}"
                file_rec.updated_at = utc_now()
                await db.commit()

    @staticmethod
    async def list_files(
        db: AsyncSession,
        owner_id: str,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[FileRecord], int, int]:
        """Lists files owned by the user, returning (items, total_count, total_bytes)."""
        query = select(FileRecord).where(FileRecord.owner_id == owner_id)

        if status:
            query = query.where(FileRecord.status == status)
        if search and search.strip():
            query = query.where(FileRecord.filename.ilike(f"%{search.strip()}%"))

        query = query.order_by(FileRecord.created_at.desc())
        items = list((await db.execute(query)).scalars().all())

        # Aggregate stats
        total_stmt = select(func.coalesce(func.sum(FileRecord.file_size), 0)).where(FileRecord.owner_id == owner_id)
        total_bytes = (await db.execute(total_stmt)).scalar_one() or 0

        return items, len(items), total_bytes

    @staticmethod
    async def get_file(
        db: AsyncSession,
        owner_id: str,
        file_id: str,
    ) -> Optional[FileRecord]:
        stmt = select(FileRecord).where(FileRecord.id == file_id, FileRecord.owner_id == owner_id)
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_file_chunks(
        db: AsyncSession,
        owner_id: str,
        file_id: str,
        limit: int = 10,
    ) -> List[DocumentChunk]:
        stmt = (
            select(DocumentChunk)
            .where(DocumentChunk.file_id == file_id, DocumentChunk.owner_id == owner_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(limit)
        )
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def delete_file(
        db: AsyncSession,
        owner_id: str,
        file_id: str,
    ) -> bool:
        file_rec = await FileService.get_file(db, owner_id, file_id)
        if not file_rec:
            return False

        storage_path = file_rec.storage_path
        # Check if any other file record shares this storage path (deduplication)
        ref_count_stmt = select(func.count(FileRecord.id)).where(FileRecord.storage_path == storage_path)
        ref_count = (await db.execute(ref_count_stmt)).scalar_one() or 0

        await db.delete(file_rec)
        await db.commit()

        # If this was the only reference to the underlying storage file, delete from disk
        if ref_count <= 1:
            storage = get_storage_backend()
            storage.delete_file(storage_path)

        return True

    @staticmethod
    async def reprocess_file(
        db: AsyncSession,
        owner_id: str,
        file_id: str,
    ) -> Optional[FileRecord]:
        file_rec = await FileService.get_file(db, owner_id, file_id)
        if not file_rec:
            return None

        file_rec.status = "uploaded"
        file_rec.error_message = None
        file_rec.updated_at = utc_now()
        await db.commit()

        try:
            await FileService.process_file(file_id)
            await db.refresh(file_rec)
        except Exception as exc:
            logger.error("Reprocessing failed for %s: %s", file_id, exc)

        return file_rec
