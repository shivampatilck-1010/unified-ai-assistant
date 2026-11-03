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
      {/* 1. Deep cosmic breathing backdrop aura */}
      <div className="unified-logo__ambient-aura" />

      <div
        className="unified-logo__img-box"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        {/* 2. High-resolution transparent 3D metallic letter U & planetary ring */}
        <img
          src="/logo.png"
          alt="Unified AI Logo"
          className="unified-logo__img"
          loading="eager"
        />

        {/* 3. Sweeping specular light sheen across the metallic letter */}
        {animated && <div className="unified-logo__sheen" />}

        {/* 4. Glowing planetary orbit plasma halo */}
        {animated && <div className="unified-logo__orbit-glow" />}

        {/* 5. Traveling cosmic photon along the orbital trajectory */}
        {animated && <div className="unified-logo__photon-track"><div className="unified-logo__photon" /></div>}
      </div>
    </div>
  );
};
