import React, { useRef, useEffect } from 'react';

interface LiveFluidOrbProps {
  volume?: number; // 0.0 to 1.0 (real audio energy)
  voiceState: 'listening' | 'thinking' | 'speaking';
  onClick?: () => void;
  size?: number;
}

export const LiveFluidOrb: React.FC<LiveFluidOrbProps> = ({
  volume = 0,
  voiceState,
  onClick,
  size = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const smoothVolRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let isMounted = true;

    // Color palettes for the 5 dynamic flowing ribbons
    const ribbonConfigs = [
      {
        // 1. Electric Cyan to Neon Sky
        grad: ['#00f2fe', '#38bdf8', '#0284c7'],
        freq: 2.0,
        harmonic: 3.0,
        zScale: 0.55,
        baseWidth: 2.8,
        phase: 0,
        rotSpeed: 0.016,
      },
      {
        // 2. Radiant Violet to Vivid Purple
        grad: ['#c084fc', '#8b5cf6', '#6d28d9'],
        freq: 3.0,
        harmonic: 2.0,
        zScale: 0.65,
        baseWidth: 2.5,
        phase: Math.PI * 0.4,
        rotSpeed: -0.014,
      },
      {
        // 3. Sunset Coral to Flamingo Rose
        grad: ['#ff758c', '#ff5e62', '#e11d48'],
        freq: 2.5,
        harmonic: 4.0,
        zScale: 0.5,
        baseWidth: 2.2,
        phase: Math.PI * 0.8,
        rotSpeed: 0.019,
      },
      {
        // 4. Emerald Aurora to Lime Jade
        grad: ['#34d399', '#10b981', '#059669'],
        freq: 1.8,
        harmonic: 3.2,
        zScale: 0.7,
        baseWidth: 2.0,
        phase: Math.PI * 1.2,
        rotSpeed: -0.012,
      },
      {
        // 5. Cosmic Magenta to Orchid Glow
        grad: ['#f472b6', '#d946ef', '#a855f7'],
        freq: 2.2,
        harmonic: 2.8,
        zScale: 0.6,
        baseWidth: 2.4,
        phase: Math.PI * 1.6,
        rotSpeed: 0.017,
      },
    ];

    const render = () => {
      if (!isMounted) return;

      // Responsive dynamic volume interpolation: Fast attack for instant organic spiking, smooth release
      const targetVol = Math.max(0, Math.min(1, volume));
      const attackSpeed = targetVol > smoothVolRef.current ? 0.65 : 0.16;
      smoothVolRef.current += (targetVol - smoothVolRef.current) * attackSpeed;
      const v = smoothVolRef.current;

      // Animation speed scaling based on voice state
      let speed = 0.024;
      if (voiceState === 'speaking') speed = 0.045;
      else if (voiceState === 'thinking') speed = 0.06;
      else speed = 0.02 + v * 0.05;

      timeRef.current += speed;
      const t = timeRef.current;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = (size * dpr * 0.36) * (1 + v * 0.28);

      ctx.clearRect(0, 0, w, h);

      // 1. Draw glowing iridescent ambient core in center
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.85);
      if (voiceState === 'speaking') {
        coreGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
        coreGrad.addColorStop(0.4, 'rgba(168, 85, 247, 0.25)');
        coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (voiceState === 'thinking') {
        coreGrad.addColorStop(0, 'rgba(129, 140, 248, 0.5)');
        coreGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.2)');
        coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        // Listening / idle
        const cyanOpacity = 0.25 + v * 0.45;
        coreGrad.addColorStop(0, `rgba(56, 189, 248, ${cyanOpacity})`);
        coreGrad.addColorStop(0.4, `rgba(139, 92, 246, ${cyanOpacity * 0.6})`);
        coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.save();
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Draw 3D flowing organic ribbons (Torus knot & harmonic curves)
      ribbonConfigs.forEach((cfg, idx) => {
        const steps = 180;
        const currentRot = t * cfg.rotSpeed * 60 + cfg.phase;
        const rotY = Math.sin(t * 0.8 + idx) * 0.45;
        const rotX = Math.cos(t * 0.6 + idx * 0.7) * 0.35;

        // Create linear gradient across canvas for this ribbon
        const lineGrad = ctx.createLinearGradient(
          cx - baseRadius,
          cy - baseRadius,
          cx + baseRadius,
          cy + baseRadius
        );
        lineGrad.addColorStop(0, cfg.grad[0]);
        lineGrad.addColorStop(0.5, cfg.grad[1]);
        lineGrad.addColorStop(1, cfg.grad[2]);

        ctx.save();
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = (cfg.baseWidth * dpr) * (1 + v * 0.75);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = cfg.grad[1];
        ctx.shadowBlur = 8 * dpr * (1 + v * 0.5);

        ctx.beginPath();

        let started = false;

        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;

          // 3D Harmonic Toroidal parametric math with expressive high-frequency audio spiking
          const harmonicMod = 0.32 * Math.sin(cfg.harmonic * theta + t * 2.2 + idx);
          const audioSpike = v * (
            0.65 * Math.sin(theta * 8 + t * 5 + idx) +
            0.35 * Math.cos(theta * 14 - t * 3)
          );
          const r = baseRadius * (0.85 + harmonicMod + audioSpike);

          // 3D coordinates on rotating torus
          const x3 = r * Math.cos(cfg.freq * theta);
          const y3 = r * Math.sin(cfg.freq * theta + Math.sin(theta * 2 + t) * 0.3);
          const z3 = baseRadius * cfg.zScale * Math.sin(theta * 3 + currentRot);

          // 3D rotation & perspective projection
          const cosY = Math.cos(rotY);
          const sinY = Math.sin(rotY);
          const cosX = Math.cos(rotX);
          const sinX = Math.sin(rotX);

          // Rotate around Y axis
          const xRot = x3 * cosY - z3 * sinY;
          const zRot1 = x3 * sinY + z3 * cosY;

          // Rotate around X axis
          const yRot = y3 * cosX - zRot1 * sinX;
          const zRot = y3 * sinX + zRot1 * cosX;

          // 3D camera perspective
          const cameraDist = baseRadius * 3.5;
          const perspective = cameraDist / (cameraDist + zRot);

          const px = cx + xRot * perspective;
          const py = cy + yRot * perspective;

          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });

      // 3. Central pulsing micro-orb button indicator
      const centerPulse = (12 * dpr) * (1 + v * 0.45);
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerPulse);
      innerGrad.addColorStop(0, '#ffffff');
      innerGrad.addColorStop(0.4, '#38bdf8');
      innerGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');

      ctx.save();
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, centerPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isMounted = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [size, voiceState, volume]);

  return (
    <div
      className={`live-fluid-orb-wrap live-fluid-orb-wrap--${voiceState}`}
      onClick={onClick}
      style={{ width: size, height: size, cursor: 'pointer' }}
      title={
        voiceState === 'speaking'
          ? 'Tap orb to interrupt speech'
          : voiceState === 'listening'
          ? 'Tap orb when done speaking'
          : 'AI Neural Visualizer'
      }
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          display: 'block',
          filter: 'drop-shadow(0 0 24px rgba(56, 189, 248, 0.35))',
        }}
      />
    </div>
  );
};
