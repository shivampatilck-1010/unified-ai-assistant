import React, { useState, useEffect, useRef } from 'react';
import './ImageGenerationCard.css';

interface ImageGenerationCardProps {
  src: string;
  alt?: string;
}

const GENERATION_MILESTONES = [
  '✨ Synthesizing neural latent space...',
  '🎨 Composing geometry & perspective...',
  '🌈 Rendering volumetric lighting & shades...',
  '🔍 Refining textures & photorealistic details...',
  '⚡ Applying final neural polish...',
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  color: string;
}

export const ImageGenerationCard: React.FC<ImageGenerationCardProps> = ({ src, alt }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [milestoneIdx, setMilestoneIdx] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [showLightbox, setShowLightbox] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; isHovered: boolean }>({
    x: -1000,
    y: -1000,
    isHovered: false,
  });

  // Track elapsed seconds and rotate milestones while generating
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

  // Gray dots particle animation on dark black background with interactive hover effect
  useEffect(() => {
    if (!loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    // Initialize gray floating dots
    const numParticles = Math.min(85, Math.max(45, Math.floor((width * height) / 4500)));
    const grayColors = ['#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563'];
    const particles: Particle[] = [];

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        radius: Math.random() * 1.8 + 1.2,
        baseAlpha: Math.random() * 0.5 + 0.35,
        color: grayColors[Math.floor(Math.random() * grayColors.length)],
      });
    }

    const maxLinkDist = 95;
    const mouseRadius = 140;

    const render = () => {
      // Dark black background
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, width, height);

      // Subtle radial dark gradient vignette
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) / 1.1
      );
      bgGrad.addColorStop(0, '#0c0d12');
      bgGrad.addColorStop(1, '#020203');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const mouse = mouseRef.current;

      // Draw faint mouse light halo when hovering
      if (mouse.isHovered) {
        const mouseHalo = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          mouseRadius
        );
        mouseHalo.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
        mouseHalo.addColorStop(0.5, 'rgba(156, 163, 175, 0.03)');
        mouseHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = mouseHalo;
        ctx.fillRect(0, 0, width, height);
      }

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Hover interaction: push/pull or connect
        if (mouse.isHovered) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.hypot(dx, dy);

          if (dist < mouseRadius) {
            // Interactive hover connection line from cursor to gray dot
            const alpha = (1 - dist / mouseRadius) * 0.55;
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = `rgba(226, 232, 240, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Subtle gentle repulsion so dots fluidly glide around cursor
            const force = (mouseRadius - dist) / mouseRadius;
            p.vx -= (dx / dist) * force * 0.04;
            p.vy -= (dy / dist) * force * 0.04;
          }
        }

        // Apply friction to keep velocities smooth
        p.vx *= 0.985;
        p.vy *= 0.985;

        // Ensure minimum motion
        if (Math.abs(p.vx) < 0.1) p.vx += (Math.random() - 0.5) * 0.15;
        if (Math.abs(p.vy) < 0.1) p.vy += (Math.random() - 0.5) * 0.15;

        p.x += p.vx;
        p.y += p.vy;

        // Bounce off canvas edges
        if (p.x < 0) {
          p.x = 0;
          p.vx *= -1;
        } else if (p.x > width) {
          p.x = width;
          p.vx *= -1;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy *= -1;
        } else if (p.y > height) {
          p.y = height;
          p.vy *= -1;
        }

        // Constellation lines between neighboring gray dots
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < maxLinkDist) {
            const alpha = (1 - dist / maxLinkDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(156, 163, 175, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Draw gray dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.baseAlpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [loading]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      isHovered: true,
    };
  };

  const handleMouseEnter = () => {
    mouseRef.current.isHovered = true;
  };

  const handleMouseLeave = () => {
    mouseRef.current = { x: -1000, y: -1000, isHovered: false };
  };

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
      <div
        className="img-gen-card"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Loading / Generating State: Moving gray dots with hover effect */}
        {loading && (
          <div className="img-gen-card__canvas-wrapper">
            <canvas ref={canvasRef} className="img-gen-card__canvas" />

            <div className="img-gen-card__glass-badge">
              <div className="img-gen-card__icon-wrapper">
                <div className="img-gen-card__radar-pulse" />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
                </svg>
              </div>

              <div className="img-gen-card__badge-content">
                <p className="img-gen-card__status-text" key={milestoneIdx}>
                  {GENERATION_MILESTONES[milestoneIdx]}
                </p>
                <div className="img-gen-card__sub-hint">
                  <span className="img-gen-card__live-indicator" />
                  <span>Synthesizing visual artwork • {elapsedSec}s</span>
                  <span className="img-gen-card__pill-meta">1024 × 1024</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Real image load (preloads in background) */}
        <img
          src={src}
          alt={alt || 'AI Generated Image'}
          className={`img-gen-card__img ${loading ? 'img-gen-card__img--hidden' : 'img-gen-card__img--visible'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          onClick={() => !loading && !error && setShowLightbox(true)}
        />

        {/* Action bar shown when image successfully rendered */}
        {!loading && !error && (
          <div className="img-gen-card__action-bar">
            <div className="img-gen-card__prompt-title">
              {alt || 'AI Generated Artwork'}
            </div>
            <div className="img-gen-card__btn-group">
              <button
                type="button"
                className="img-gen-card__btn"
                onClick={handleCopyLink}
                title={copied ? 'Copied link!' : 'Copy image link'}
              >
                {copied ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                className="img-gen-card__btn"
                onClick={handleDownload}
                title="Download PNG"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Save</span>
              </button>

              <button
                type="button"
                className="img-gen-card__btn img-gen-card__btn--zoom"
                onClick={() => setShowLightbox(true)}
                title="Expand fullscreen"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                <span>Expand</span>
              </button>
            </div>
          </div>
        )}

        {/* Fallback if image failed to load */}
        {error && (
          <div className="img-gen-card__error-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>Image preview unavailable or generation expired.</p>
          </div>
        )}
      </div>

      {/* Lightbox / Modal */}
      {showLightbox && (
        <div
          className="img-gen-lightbox"
          onClick={() => setShowLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="img-gen-lightbox__content" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={alt || 'Enlarged artwork'} className="img-gen-lightbox__img" />
            <button
              type="button"
              className="img-gen-lightbox__close"
              onClick={() => setShowLightbox(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
};
