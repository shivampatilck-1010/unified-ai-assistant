import React from 'react';
import './FileAttachmentCard.css';

interface FileAttachmentCardProps {
  filename: string;
  filetype?: string;
  downloadUrl?: string;
  content?: string;
}

export const FileAttachmentCard: React.FC<FileAttachmentCardProps> = ({
  filename,
  filetype,
  downloadUrl,
  content,
}) => {
  // Infer file type and extension label
  const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';
  const subtitle = filetype || `Document • ${ext}`;

  // Clean title for display (e.g. "INT335_P24_chat_export.md" -> "Int335 p24 chat export")
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const displayTitle = baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // If inline content is provided or generated
    const fileContent = content || `# ${displayTitle}\n\nExported document from Unified AI Assistant.\n`;
    const blob = new Blob([fileContent], { type: 'text/markdown;charset=utf-8' });
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  };

  return (
    <div
      className="file-attachment-card"
      onClick={handleDownload}
      role="button"
      tabIndex={0}
      title={`Download ${filename}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleDownload(e as unknown as React.MouseEvent);
        }
      }}
    >
      <div className="file-attachment-card__icon-box" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="10 9 9 9 8 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="file-attachment-card__details">
        <span className="file-attachment-card__title">{displayTitle}</span>
        <span className="file-attachment-card__subtitle">{subtitle}</span>
      </div>

      <div className="file-attachment-card__action" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
