import React, { useRef, useState, useCallback } from 'react';
import './LiquidGlassCard.css';

export interface LiquidGlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tilt?: boolean;
  style?: React.CSSProperties;
}

export const LiquidGlassCard: React.FC<LiquidGlassCardProps> = ({
  children,
  className = '',
  onClick,
  tilt = true,
  style,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [glareStyle, setGlareStyle] = useState<React.CSSProperties>({});
  const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Glare position
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    setGlareStyle({
      background: `radial-gradient(circle 180px at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.25) 0%, transparent 80%)`,
    });

    if (tilt) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;
      setTiltStyle({
        transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(4px)`,
      });
    }
  }, [tilt]);

  const handleMouseLeave = useCallback(() => {
    setGlareStyle({ background: 'transparent' });
    if (tilt) {
      setTiltStyle({
        transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
      });
    }
  }, [tilt]);

  return (
    <div
      ref={cardRef}
      className={`liquid-glass-card ${className}`}
      style={{ ...style, ...tiltStyle }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="liquid-glass-card__glare" style={glareStyle} aria-hidden="true" />
      <div className="liquid-glass-card__content">{children}</div>
    </div>
  );
};
