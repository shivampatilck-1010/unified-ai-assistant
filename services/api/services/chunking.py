from dataclasses import dataclass
from typing import List, Optional, Tuple
from services.extractors.base import ExtractionResult


@dataclass
class ChunkData:
    chunk_index: int
    content: str
    page_number: Optional[int]
    section_title: Optional[str]
    token_count: int


def _split_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
    """Splits a single text block into overlapping chunks, respecting paragraphs."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunks.append(text[start:].strip())
            break

        # Look for natural split point (newline or space) near end
        split_pos = text.rfind("\n\n", start, end)
        if split_pos == -1 or split_pos <= start + (chunk_size // 3):
            split_pos = text.rfind("\n", start, end)
        if split_pos == -1 or split_pos <= start + (chunk_size // 3):
            split_pos = text.rfind(" ", start, end)
        if split_pos == -1 or split_pos <= start:
            split_pos = end

        chunk_text = text[start:split_pos].strip()
        if chunk_text:
            chunks.append(chunk_text)

        # Advance start position with overlap
        start = max(split_pos - overlap, start + 1)

    return chunks


def chunk_extracted_document(
    result: ExtractionResult,
    chunk_size: int = 800,
    overlap: int = 150,
) -> List[ChunkData]:
    """Chunks an ExtractionResult preserving page provenance."""
    chunks: List[ChunkData] = []
    chunk_index = 0

    if result.pages:
        for page_num, page_text in result.pages:
            if not page_text.strip():
                continue
            sub_chunks = _split_text(page_text, chunk_size=chunk_size, overlap=overlap)
            for sc in sub_chunks:
                if sc.strip():
                    token_estimate = max(1, len(sc) // 4)
                    chunks.append(
                        ChunkData(
                            chunk_index=chunk_index,
                            content=sc.strip(),
                            page_number=page_num,
                            section_title=None,
                            token_count=token_estimate,
                        )
                    )
                    chunk_index += 1
    elif result.text and result.text.strip():
        sub_chunks = _split_text(result.text, chunk_size=chunk_size, overlap=overlap)
        for sc in sub_chunks:
            if sc.strip():
                token_estimate = max(1, len(sc) // 4)
                chunks.append(
                    ChunkData(
                        chunk_index=chunk_index,
                        content=sc.strip(),
                        page_number=1,
                        section_title=None,
                        token_count=token_estimate,
                    )
                )
                chunk_index += 1

    return chunks
