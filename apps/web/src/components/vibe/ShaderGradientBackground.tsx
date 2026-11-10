import React, { useRef, useEffect } from 'react';

export interface ShaderGradientBackgroundProps {
  className?: string;
  opacity?: number;
  speed?: number;
}

export const ShaderGradientBackground: React.FC<ShaderGradientBackgroundProps> = ({
  className = '',
  opacity = 0.45,
  speed = 0.0006,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;
    let isVisible = true;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // Pause when tab hidden
    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Warm terracotta, deep indigo, subtle amber, and dark obsidian
    const colors = [
      { r: 217, g: 119, b: 87 },  // Anthropic Terracotta
      { r: 49, g: 46, b: 129 },   // Deep Indigo
      { r: 180, g: 83, b: 9 },    // Warm Amber
      { r: 7, g: 7, b: 9 },       // Obsidian Base
    ];

    const render = () => {
      if (isVisible) {
        time += speed * 16;
        const parent = canvas.parentElement;
        const w = parent ? parent.clientWidth : canvas.width;
        const h = parent ? parent.clientHeight : canvas.height;

        if (w > 0 && h > 0) {
          ctx.clearRect(0, 0, w, h);

          // Center coordinates oscillating with harmonic sine waves
          const x1 = w * (0.35 + 0.25 * Math.sin(time * 0.7));
          const y1 = h * (0.35 + 0.25 * Math.cos(time * 0.8));
          const radius1 = Math.max(w, h) * 0.55;

          const g1 = ctx.createRadialGradient(x1, y1, 10, x1, y1, radius1);
          g1.addColorStop(0, `rgba(${colors[0].r}, ${colors[0].g}, ${colors[0].b}, 0.22)`);
          g1.addColorStop(0.5, `rgba(${colors[1].r}, ${colors[1].g}, ${colors[1].b}, 0.12)`);
          g1.addColorStop(1, 'rgba(7, 7, 9, 0)');

          ctx.fillStyle = g1;
          ctx.fillRect(0, 0, w, h);

          const x2 = w * (0.65 + 0.2 * Math.cos(time * 0.9));
          const y2 = h * (0.65 + 0.2 * Math.sin(time * 0.6));
          const radius2 = Math.max(w, h) * 0.5;

          const g2 = ctx.createRadialGradient(x2, y2, 20, x2, y2, radius2);
          g2.addColorStop(0, `rgba(${colors[2].r}, ${colors[2].g}, ${colors[2].b}, 0.14)`);
          g2.addColorStop(0.6, `rgba(${colors[1].r}, ${colors[1].g}, ${colors[1].b}, 0.08)`);
          g2.addColorStop(1, 'rgba(7, 7, 9, 0)');

          ctx.fillStyle = g2;
          ctx.fillRect(0, 0, w, h);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`shader-gradient-background pointer-events-none absolute inset-0 w-full h-full ${className}`}
      style={{ opacity, filter: 'blur(40px)', transform: 'translateZ(0)' }}
      aria-hidden="true"
    />
  );
};
