import React from 'react';
import { LiquidChromeLogo } from '../vibe/LiquidChromeLogo';
import './UnifiedLogo.css';

export interface UnifiedLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UnifiedLogo: React.FC<UnifiedLogoProps> = ({
  size = 32,
  animated = false,
  className = '',
  onClick,
}) => {
  if (animated) {
    return (
      <div
        className={`unified-logo unified-logo--animated ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
        onClick={onClick}
      >
        <LiquidChromeLogo size={size} onClick={onClick} />
      </div>
    );
  }

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
