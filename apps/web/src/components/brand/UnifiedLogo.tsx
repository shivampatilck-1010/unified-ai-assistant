import React from 'react';
import './UnifiedLogo.css';

interface UnifiedLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UnifiedLogo: React.FC<UnifiedLogoProps> = ({
  size = 32,
  animated = true,
  className = '',
  onClick,
}) => {
  return (
    <div
      className={`unified-logo ${animated ? 'unified-logo--animated' : ''} ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title="Unified AI"
    >
      <div className="unified-logo__ambient-aura" />
      <div
        className="unified-logo__img-box"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <img
          src="/logo.png"
          alt="Unified AI Logo"
          className="unified-logo__img"
          loading="eager"
        />
        {animated && <div className="unified-logo__sheen" />}
        {animated && <div className="unified-logo__orbit-glow" />}
      </div>
    </div>
  );
};
