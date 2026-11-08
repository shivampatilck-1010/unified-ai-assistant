import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import type {
  FileMetadata,
  FileDetailResponse,
  KnowledgeAnswerResponse,
  ChunkCitation,
} from '../../types';
import {
  fetchFiles,
  uploadFile,
  fetchFileDetail,
  deleteFile,
  reprocessFile,
  answerKnowledge,
} from '../../lib/api';
import { MarkdownContent } from '../chat/MarkdownContent';
import './FilesKnowledgeView.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const FilesKnowledgeView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'files' | 'ask'>('files');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [maxStorageBytes, setMaxStorageBytes] = useState(100 * 1024 * 1024);
  const [fileCount, setFileCount] = useState(0);
  const [maxFileCount, setMaxFileCount] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview Modal state
  const [inspectingFile, setInspectingFile] = useState<FileDetailResponse | null>(null);
  const [isInspectingLoading, setIsInspectingLoading] = useState(false);

  // Ask Documents Q&A state
  const [question, setQuestion] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerResult, setAnswerResult] = useState<KnowledgeAnswerResponse | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const filterId = useId();
  const docSelectId = useId();

  const loadFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchFiles(statusFilter || undefined, searchQuery || undefined);
      setFiles(Array.isArray(res?.items) ? res.items : []);
      setTotalStorageBytes(res?.total_storage_bytes || 0);
      setMaxStorageBytes(res?.max_storage_bytes || 104857600);
      setFileCount(res?.file_count || (Array.isArray(res?.items) ? res.items.length : 0));
      setMaxFileCount(res?.max_file_count || 50);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleUploadFiles(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadFiles = async (selectedFiles: File[]) => {
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    let successCount = 0;
    const errors: string[] = [];

    for (const f of selectedFiles) {
      if (f.size > 20 * 1024 * 1024) {
        errors.push(`"${f.name}" exceeds the 20MB limit.`);
        continue;
      }
      try {
        await uploadFile(f);
        successCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown upload error';
        errors.push(`"${f.name}": ${msg}`);
      }
    }

    setIsUploading(false);
    if (errors.length > 0) {
      setUploadError(errors.join(' | '));
    }
    if (successCount > 0) {
      setUploadSuccess(`Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}.`);
      await loadFiles();
    }
  };

  // Inspect Chunks
  const handleInspect = async (fileId: string) => {
    setIsInspectingLoading(true);
    try {
      const detail = await fetchFileDetail(fileId);
      setInspectingFile(detail);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to fetch chunk details');
    } finally {
      setIsInspectingLoading(false);
    }
  };

  // Reprocess
  const handleReprocess = async (fileId: string) => {
    try {
      await reprocessFile(fileId);
      await loadFiles();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reprocessing failed');
    }
  };

  // Delete
  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? All indexed chunks will be permanently removed.`)) {
      return;
    }
    try {
      await deleteFile(fileId);
      await loadFiles();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // Ask Question
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsAnswering(true);
    setAnswerError(null);
    setAnswerResult(null);

    try {
      const res = await answerKnowledge({
        query: question.trim(),
        file_ids: selectedFileIds.length > 0 ? selectedFileIds : undefined,
      });
      setAnswerResult(res);
    } catch (err: unknown) {
      setAnswerError(err instanceof Error ? err.message : 'Failed to generate answer.');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleCopyCitation = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const storagePct = Math.min(100, Math.round((totalStorageBytes / (maxStorageBytes || 1)) * 100));

  return (
    <div className="fk-container">
      {/* Header */}
      <div className="fk-header">
        <div className="fk-header__title-row">
          <div>
            <h1 className="fk-header__title">Files & Knowledge</h1>
            <p className="fk-header__subtitle">
              Upload documents, manage your personal index, and ask grounded questions.
            </p>
          </div>

          {/* Quota Bar */}
          <div className="fk-quota">
            <div className="fk-quota__info">
              <span>Storage: {formatBytes(totalStorageBytes)} / {formatBytes(maxStorageBytes)}</span>
              <span>{fileCount} / {maxFileCount} files</span>
            </div>
            <div className="fk-quota__bar-bg">
              <div
                className="fk-quota__bar-fill"
                style={{ width: `${storagePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="fk-tabs">
        <button
          className={`fk-tab-btn ${activeTab === 'files' ? 'fk-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          My Documents ({files.length})
        </button>
        <button
          className={`fk-tab-btn ${activeTab === 'ask' ? 'fk-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('ask')}
        >
          Ask Your Documents
        </button>
      </div>

      {/* Alerts */}
      {uploadError && (
        <div className="fk-alert fk-alert--error">
          <span>{uploadError}</span>
          <button className="fk-btn" onClick={() => setUploadError(null)}>Dismiss</button>
        </div>
      )}
      {uploadSuccess && (
        <div className="fk-alert fk-alert--success">
          <span>{uploadSuccess}</span>
          <button className="fk-btn" onClick={() => setUploadSuccess(null)}>Dismiss</button>
        </div>
      )}

      {/* TAB 1: FILES */}
      {activeTab === 'files' && (
        <>
          {/* Dropzone */}
          <div
            className={`fk-dropzone ${isDragging ? 'fk-dropzone--dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              onChange={handleFileInputChange}
            />
            <div className="fk-dropzone__icon">
              <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1.5A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V6L9 1.5H4zm5 1l3 3.5H9v-3.5zM4 3h4v4h4v6H4V3z" />
              </svg>
            </div>
            <p className="fk-dropzone__heading">
              {isUploading ? 'Uploading and indexing...' : 'Drop files here or click to browse'}
            </p>
            <p className="fk-dropzone__subtext">
              Private, encrypted storage outside public web routes. Maximum 20 MB per file.
            </p>
            <div className="fk-dropzone__formats">
              <span className="fk-format-badge">PDF</span>
              <span className="fk-format-badge">DOCX</span>
              <span className="fk-format-badge">TXT</span>
              <span className="fk-format-badge">Markdown (.md)</span>
              <span className="fk-format-badge">CSV</span>
              <span className="fk-format-badge">Source (.py, .ts, .json, .sql)</span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="fk-toolbar">
            <input
              type="text"
              className="fk-search-input"
              placeholder="Search filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              id={filterId}
              className="fk-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter documents by status"
            >
              <option value="">All Statuses</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="uploaded">Uploaded</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Files List */}
          {isLoading ? (
            <div className="fk-empty">Loading documents...</div>
          ) : files.length === 0 ? (
            <div className="fk-empty">
              <p>No documents uploaded yet.</p>
              <p style={{ fontSize: '0.85rem' }}>Upload files above to start asking grounded questions.</p>
            </div>
          ) : (
            <div className="fk-file-list">
              {files.map((f) => (
                <div key={f.id} className="fk-file-card">
                  <div className="fk-file-info">
                    <div className="fk-file-icon">{f.file_type}</div>
                    <div className="fk-file-details">
                      <span className="fk-file-name" title={f.filename}>{f.filename}</span>
                      <div className="fk-file-meta">
                        <span>{formatBytes(f.file_size)}</span>
                        <span>•</span>
                        <span>{f.chunk_count} chunk{f.chunk_count !== 1 ? 's' : ''}</span>
                        {f.page_count ? (
                          <>
                            <span>•</span>
                            <span>{f.page_count} page{f.page_count !== 1 ? 's' : ''}</span>
                          </>
                        ) : null}
                        <span>•</span>
                        <span className={`fk-badge fk-badge--${f.status}`}>
                          {f.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="fk-file-actions">
                    <button
                      className="fk-btn"
                      onClick={() => handleInspect(f.id)}
                      disabled={isInspectingLoading}
                      title="Inspect extracted chunks"
                    >
                      Inspect Chunks
                    </button>
                    <button
                      className="fk-btn"
                      onClick={() => handleReprocess(f.id)}
                      title="Re-run extraction and indexing"
                    >
                      Reprocess
                    </button>
                    <button
                      className="fk-btn fk-btn--danger"
                      onClick={() => handleDelete(f.id, f.filename)}
                      title="Permanently delete document"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: ASK DOCUMENTS */}
      {activeTab === 'ask' && (
        <div className="fk-ask-section">
          <form className="fk-ask-box" onSubmit={handleAsk}>
            <textarea
              className="fk-ask-textarea"
              placeholder="Ask a question about your uploaded documents (e.g., 'What were the quarterly revenue numbers in Q3?')"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
            />

            <div className="fk-ask-controls">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor={docSelectId} style={{ fontSize: '0.85rem', color: '#888' }}>
                  Target Documents:
                </label>
                <select
                  id={docSelectId}
                  className="fk-filter-select"
                  value={selectedFileIds[0] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedFileIds(val ? [val] : []);
                  }}
                  aria-label="Select target document"
                >
                  <option value="">All Documents ({files.length})</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.filename}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="fk-btn fk-btn--primary"
                disabled={isAnswering || !question.trim()}
              >
                {isAnswering ? 'Synthesizing...' : 'Ask Assistant'}
              </button>
            </div>
          </form>

          {answerError && (
            <div className="fk-alert fk-alert--error">
              <span>{answerError}</span>
            </div>
          )}

          {answerResult && (
            <div className="fk-answer-card">
              <div className="fk-answer-header">
                <span className={`fk-badge ${answerResult.sufficient_evidence ? 'fk-badge--ready' : 'fk-badge--failed'}`}>
                  {answerResult.sufficient_evidence ? 'Sufficient Evidence' : 'Insufficient Evidence'}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#999' }}>
                  Strategy: {answerResult.strategy_used === 'semantic' ? 'Semantic Vector' : 'Lexical Search'}
                </span>
              </div>

              <div className="fk-answer-text">
                <MarkdownContent content={answerResult.answer} />
              </div>

              {answerResult.citations.length > 0 && (
                <>
                  <div className="fk-citations-heading">
                    Verified Document Citations ({answerResult.citations.length})
                  </div>
                  <div className="fk-citations-grid">
                    {answerResult.citations.map((c: ChunkCitation, idx: number) => {
                      const pageLabel = c.page_number ? `Page ${c.page_number}` : `Section ${c.chunk_index + 1}`;
                      return (
                        <div key={idx} className="fk-citation-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="fk-citation-badge">
                              [Doc: {c.filename}, {pageLabel}]
                            </span>
                            <button
                              className="fk-btn"
                              style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                              onClick={() => handleCopyCitation(c.snippet, idx)}
                            >
                              {copiedIndex === idx ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="fk-citation-snippet">
                            {c.snippet}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chunk Inspection Modal */}
      {inspectingFile && (
        <div className="fk-modal-overlay" onClick={() => setInspectingFile(null)}>
          <div className="fk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fk-modal__header">
              <div>
                <h3 className="fk-modal__title">{inspectingFile.file.filename}</h3>
                <span style={{ fontSize: '0.8rem', color: '#888' }}>
                  {inspectingFile.file.chunk_count} chunks indexed • {formatBytes(inspectingFile.file.file_size)}
                </span>
              </div>
              <button
                className="fk-modal__close-btn"
                onClick={() => setInspectingFile(null)}
              >
                ✕
              </button>
            </div>

            <div className="fk-modal__body">
              {inspectingFile.preview_chunks.length === 0 ? (
                <p style={{ color: '#888' }}>No chunks available for this file.</p>
              ) : (
                inspectingFile.preview_chunks.map((chk) => (
                  <div key={chk.id} className="fk-chunk-card">
                    <div className="fk-chunk-meta">
                      <span>
                        Chunk #{chk.chunk_index + 1}
                        {chk.page_number ? ` • Page ${chk.page_number}` : ''}
                        {chk.section_title ? ` • ${chk.section_title}` : ''}
                      </span>
                      <span>{chk.token_count} tokens</span>
                    </div>
                    <div className="fk-chunk-content">
                      {chk.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
