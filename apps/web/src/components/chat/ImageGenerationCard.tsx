import React, { useState, useEffect } from 'react';
import './ImageGenerationCard.css';

interface ImageGenerationCardProps {
  src: string;
  alt?: string;
}

const GENERATION_MILESTONES = [
  '✨ Initializing neural canvas...',
  '🎨 Composing scene layout & perspective...',
  '🌈 Rendering lighting, shadows & color palettes...',
  '🔍 Synthesizing intricate details & textures...',
  '⚡ Applying high-resolution neural polish...',
];

export const ImageGenerationCard: React.FC<ImageGenerationCardProps> = ({ src, alt }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [milestoneIdx, setMilestoneIdx] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [showLightbox, setShowLightbox] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Rotate generation milestones and track seconds while loading
  useEffect(() => {
    if (!loading) return;

    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    const milestoneTimer = setInterval(() => {
      setMilestoneIdx((prev) => (prev + 1) % GENERATION_MILESTONES.length);
    }, 2200);

    return () => {
      clearInterval(timer);
      clearInterval(milestoneTimer);
    };
  }, [loading]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeName = (alt || 'ai-generated-image')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 32);
      link.download = `${safeName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(src, '_blank');
    }
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(src);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="img-gen-card">
        {/* Loading / Generating State */}
        {loading && (
          <div className="img-gen-card__loading-container">
            <div className="img-gen-card__shimmer-overlay" />
            <div className="img-gen-card__scan-line" />

            <div className="img-gen-card__center-badge">
              <div className="img-gen-card__icon-wrapper">
                <div className="img-gen-card__icon-glow" />
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 2L14.4 7.6L20 8.2L16 12.4L17.2 18L12 15.2L6.8 18L8 12.4L4 8.2L9.6 7.6L12 2Z" />
                  <circle cx="19" cy="5" r="2" fill="currentColor" />
                </svg>
              </div>

              <div>
                <p className="img-gen-card__status-text" key={milestoneIdx}>
                  {GENERATION_MILESTONES[milestoneIdx]}
                </p>
                <div className="img-gen-card__sub-hint">
                  <span className="img-gen-card__sub-hint-dot" />
                  <span>Generating high-res visual • {elapsedSec}s</span>
                </div>
              </div>
            </div>

            <div className="img-gen-card__progress-track">
              <div className="img-gen-card__progress-bar" />
            </div>
          </div>
        )}

        {/* Failed to load */}
        {error && (
          <div className="img-gen-card__loading-container" style={{ background: '#1c1917' }}>
            <div className="img-gen-card__center-badge">
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <p className="img-gen-card__status-text" style={{ color: '#f87171' }}>
                Unable to render image from provider
              </p>
              <button
                type="button"
                onClick={() => {
                  setError(false);
                  setLoading(true);
                }}
                style={{
                  background: '#292524',
                  border: '1px solid #44403c',
                  color: '#e7e5e4',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginTop: '8px',
                }}
              >
                Retry Generation
              </button>
            </div>
          </div>
        )}

        {/* Actual Image Element (hidden while loading, smooth fade-in once ready) */}
        <div
          className="img-gen-card__image-container"
          style={{ display: loading || error ? 'none' : 'block' }}
          onClick={() => setShowLightbox(true)}
        >
          <img
            src={src}
            alt={alt || 'AI Generated Image'}
            className="img-gen-card__img"
            loading="eager"
            onLoad={() => {
              setLoading(false);
              setError(false);
            }}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />

          {/* Hover Actions Toolbar */}
          <div className="img-gen-card__overlay">
            <button
              type="button"
              className="img-gen-card__action-btn"
              title="Download full resolution"
              onClick={handleDownload}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="img-gen-card__action-btn"
              title={copied ? 'Link copied!' : 'Copy image link'}
              onClick={handleCopyLink}
            >
              {copied ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="img-gen-card__action-btn"
              title="Expand lightbox"
              onClick={(e) => {
                e.stopPropagation();
                setShowLightbox(true);
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Footer with Caption & Badge */}
        {!error && (
          <div className="img-gen-card__footer">
            <span className="img-gen-card__caption" title={alt || 'AI Visual Creation'}>
              {alt || 'AI Visual Artwork'}
            </span>
            <div className="img-gen-card__badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>{loading ? 'Rendering' : 'Generated'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Fullscreen Modal */}
      {showLightbox && (
        <div className="img-lightbox" onClick={() => setShowLightbox(false)}>
          <div className="img-lightbox__content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="img-lightbox__close"
              onClick={() => setShowLightbox(false)}
            >
              <span>Close</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <img src={src} alt={alt || 'Full Resolution Preview'} className="img-lightbox__img" />
          </div>
        </div>
      )}
    </>
  );
};
