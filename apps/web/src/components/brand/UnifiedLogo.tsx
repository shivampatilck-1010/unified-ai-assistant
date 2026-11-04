import React from 'react';
import './UnifiedLogo.css';

export interface UnifiedLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UnifiedLogo: React.FC<UnifiedLogoProps> = ({
  size = 32,
  className = '',
  onClick,
}) => {
  return (
    <div
      className={`unified-logo ${className}`}
      style={{
        '--logo-default-size': `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
      } as React.CSSProperties}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title="Unified AI"
    >
      <img
        src="/logo.png"
        alt="Unified AI Logo"
        className="unified-logo__img"
        loading="eager"
      />
    </div>
  );
};
