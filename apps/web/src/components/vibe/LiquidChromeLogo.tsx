import React, { useRef, useEffect, useCallback } from 'react';

export interface LiquidChromeLogoProps {
  size?: number;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export const LiquidChromeLogo: React.FC<LiquidChromeLogoProps> = ({
  size = 72,
  className = '',
  onClick,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, isHovered: false });
  const rippleRef = useRef<{ phase: number; active: boolean }>({ phase: 0, active: false });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.targetX = (e.clientX - rect.left) / rect.width;
    mouseRef.current.targetY = (e.clientY - rect.top) / rect.height;
    mouseRef.current.isHovered = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.targetX = 0.5;
    mouseRef.current.targetY = 0.5;
    mouseRef.current.isHovered = false;
  }, []);

  const handleClick = useCallback(() => {
    rippleRef.current.phase = 0;
    rippleRef.current.active = true;
    if (onClick) onClick();
  }, [onClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let animId: number;
    let time = 0;

    const render = () => {
      time += 0.025;
      const m = mouseRef.current;
      m.x += (m.targetX - m.x) * 0.12;
      m.y += (m.targetY - m.y) * 0.12;

      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = size * 0.38;

      ctx.clearRect(0, 0, size, size);

      // Handle click ripple
      let rippleWave = 0;
      if (rippleRef.current.active) {
        rippleRef.current.phase += 0.12;
        rippleWave = Math.sin(rippleRef.current.phase * 3) * Math.exp(-rippleRef.current.phase * 0.4) * 6;
        if (rippleRef.current.phase > 6) rippleRef.current.active = false;
      }

      // Liquid Chrome dynamic gradient simulating HDR reflection
      const grad = ctx.createLinearGradient(
        cx - baseRadius + (m.x - 0.5) * 40,
        cy - baseRadius + (m.y - 0.5) * 40,
        cx + baseRadius,
        cy + baseRadius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, '#cbd5e1');
      grad.addColorStop(0.35, '#334155');
      grad.addColorStop(0.48, '#D97757'); // Unified Terracotta reflection
      grad.addColorStop(0.65, '#f8fafc');
      grad.addColorStop(0.82, '#1e293b');
      grad.addColorStop(1, '#0f172a');

      // Fluid contour
      ctx.save();
      ctx.beginPath();
      const points = 48;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const wave1 = Math.sin(angle * 3 + time * 1.5) * (m.isHovered ? 4.5 : 2.5);
        const wave2 = Math.cos(angle * 5 - time * 2) * (m.isHovered ? 3.5 : 1.5);
        const r = baseRadius + wave1 + wave2 + rippleWave;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Outer glow
      ctx.shadowColor = 'rgba(217, 119, 87, 0.35)';
      ctx.shadowBlur = m.isHovered ? 24 : 14;
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular rim
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      // Inner refractive core symbol "U"
      ctx.save();
      ctx.fillStyle = '#070709';
      ctx.font = `bold ${Math.round(size * 0.32)}px var(--font-sans, system-ui)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowBlur = 4;
      ctx.fillText('U', cx, cy + 1);
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={`liquid-chrome-logo transition-transform duration-300 ease-out hover:scale-105 active:scale-95 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        cursor: interactive ? 'pointer' : 'default',
      }}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
      onClick={interactive ? handleClick : undefined}
      title="Unified AI - Liquid Chrome Core"
    />
  );
};
