import React, { useState } from 'react';
import { exportMarkdownToPdf, extractDocumentTitle } from '../../utils/pdfExporter';
import './PdfExportCard.css';

interface PdfExportCardProps {
  content: string;
  title?: string;
  subtitle?: string;
}

export const PdfExportCard: React.FC<PdfExportCardProps> = ({
  content,
  title,
  subtitle,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const resolvedTitle =
    title ||
    extractDocumentTitle(content) ||
    'Exam Preparation Guide & Reference Document';

  const resolvedSubtitle =
    subtitle ||
    'Full Study Guide with Formatted Equations, Algorithms, & Cheat Sheets';

  const handleExport = () => {
    setIsExporting(true);
    try {
      exportMarkdownToPdf(content, {
        title: resolvedTitle,
        subtitle: resolvedSubtitle,
      });
    } finally {
      setTimeout(() => {
        setIsExporting(false);
      }, 1200);
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pdf-export-card">
      <div className="pdf-export-card__glow-border" />
      <div className="pdf-export-card__header">
        <div className="pdf-export-card__icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        <div className="pdf-export-card__info">
          <div className="pdf-export-card__badge-row">
            <span className="pdf-export-card__badge">
              <span className="pdf-export-card__badge-dot" />
              PRINTABLE PDF READY
            </span>
            <span className="pdf-export-card__meta-tag">High Fidelity</span>
            <span className="pdf-export-card__meta-tag">KaTeX Math Formatted</span>
          </div>
          <h3 className="pdf-export-card__title">{resolvedTitle}</h3>
          <p className="pdf-export-card__subtitle">{resolvedSubtitle}</p>
        </div>

        <div className="pdf-export-card__actions">
          <button
            type="button"
            className="pdf-export-card__btn-primary"
            onClick={handleExport}
            disabled={isExporting}
            title="Download formatted document as PDF"
          >
            {isExporting ? (
              <>
                <svg className="pdf-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <span>Preparing PDF...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download PDF / Print</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="pdf-export-card__btn-secondary"
            onClick={handleCopy}
            title="Copy entire document text"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ color: '#4ade80' }}>Copied!</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy Text</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
