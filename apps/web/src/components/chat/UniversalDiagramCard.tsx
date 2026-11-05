import React, { useState, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './UniversalDiagramCard.css';

export interface UniversalDiagramProps {
  type?: 'atom' | 'molecule' | 'cell' | 'circuit' | 'neural-net' | 'custom-svg' | string;
  title?: string;
  code?: string;
  element?: string;
}

interface AtomPreset {
  name: string;
  symbol: string;
  z: number;
  a: number;
  shells: number[];
  config: string;
  group: string;
  period: number;
}

const ATOM_PRESETS: AtomPreset[] = [
  { name: 'Hydrogen', symbol: 'H', z: 1, a: 1, shells: [1], config: '1s^1', group: 'Nonmetal (Group 1)', period: 1 },
  { name: 'Helium', symbol: 'He', z: 2, a: 4, shells: [2], config: '1s^2', group: 'Noble Gas (Group 18)', period: 1 },
  { name: 'Lithium', symbol: 'Li', z: 3, a: 7, shells: [2, 1], config: '[\\text{He}]\\,2s^1', group: 'Alkali Metal (Group 1)', period: 2 },
  { name: 'Carbon', symbol: 'C', z: 6, a: 12, shells: [2, 4], config: '[\\text{He}]\\,2s^2\\,2p^2', group: 'Reactive Nonmetal (Group 14)', period: 2 },
  { name: 'Nitrogen', symbol: 'N', z: 7, a: 14, shells: [2, 5], config: '[\\text{He}]\\,2s^2\\,2p^3', group: 'Pnictogen (Group 15)', period: 2 },
  { name: 'Oxygen', symbol: 'O', z: 8, a: 16, shells: [2, 6], config: '[\\text{He}]\\,2s^2\\,2p^4', group: 'Chalcogen (Group 16)', period: 2 },
  { name: 'Sodium', symbol: 'Na', z: 11, a: 23, shells: [2, 8, 1], config: '[\\text{Ne}]\\,3s^1', group: 'Alkali Metal (Group 1)', period: 3 },
  { name: 'Silicon', symbol: 'Si', z: 14, a: 28, shells: [2, 8, 4], config: '[\\text{Ne}]\\,3s^2\\,3p^2', group: 'Metalloid (Group 14)', period: 3 },
  { name: 'Chlorine', symbol: 'Cl', z: 17, a: 35, shells: [2, 8, 7], config: '[\\text{Ne}]\\,3s^2\\,3p^5', group: 'Halogen (Group 17)', period: 3 },
  { name: 'Calcium', symbol: 'Ca', z: 20, a: 40, shells: [2, 8, 8, 2], config: '[\\text{Ar}]\\,4s^2', group: 'Alkaline Earth (Group 2)', period: 4 },
];

function renderMathHtml(math: string, displayMode = false): string {
  try {
    return katex.renderToString(math, {
      displayMode,
      throwOnError: false,
    });
  } catch {
    return math;
  }
}

export const UniversalDiagramCard: React.FC<UniversalDiagramProps> = ({
  type = 'atom',
  title,
  code = '',
  element = 'Carbon',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [animate, setAnimate] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Selected atom preset
  const [atomIndex, setAtomIndex] = useState<number>(() => {
    const idx = ATOM_PRESETS.findIndex(
      (a) => a.name.toLowerCase() === element.toLowerCase() || a.symbol.toLowerCase() === element.toLowerCase()
    );
    return idx >= 0 ? idx : 3; // Default to Carbon (index 3)
  });

  // Selected molecule preset
  const [moleculePreset, setMoleculePreset] = useState<'water' | 'benzene'>('water');

  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  // Detect diagram type
  const normalizedType = useMemo(() => {
    const lower = (type || '').toLowerCase();
    const lowerCode = (code || '').toLowerCase();
    if (lower.includes('atom') || lowerCode.includes('type: atom') || lowerCode.includes('bohr')) return 'atom';
    if (lower.includes('molecule') || lowerCode.includes('type: molecule') || lowerCode.includes('benzene') || lowerCode.includes('water')) return 'molecule';
    if (lower.includes('neural') || lowerCode.includes('type: neural')) return 'neural-net';
    if (code && code.trim().startsWith('<svg')) return 'custom-svg';
    return 'atom';
  }, [type, code]);

  const currentAtom = ATOM_PRESETS[atomIndex] || ATOM_PRESETS[3];

  // Export as vector SVG
  const handleExportSvg = () => {
    const svgElem = svgContainerRef.current?.querySelector('svg');
    if (!svgElem) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElem);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || normalizedType}_diagram.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export as high-resolution 2x Retina PNG
  const handleExportPng = () => {
    const svgElem = svgContainerRef.current?.querySelector('svg');
    if (!svgElem) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElem);
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // 2x Retina
      canvas.width = (svgElem.clientWidth || 660) * scale;
      canvas.height = (svgElem.clientHeight || 480) * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#121110';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${title || normalizedType}_diagram.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleCopy = () => {
    const svgElem = svgContainerRef.current?.querySelector('svg');
    if (!svgElem) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElem);
    void navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render Bohr Atom Diagram (Clean, Large, Zero Text Collisions)
  const renderAtomSvg = () => {
    const cx = 330;
    const cy = 240;
    // Generous radial spacing so orbital shells and electrons NEVER collide
    const shellRadii = [75, 135, 195, 245];
    const shellNames = ['K (n=1)', 'L (n=2)', 'M (n=3)', 'N (n=4)'];

    return (
      <svg
        viewBox="0 0 660 480"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Bohr model of ${currentAtom.name}`}
        style={{ textRendering: 'geometricPrecision', shapeRendering: 'geometricPrecision' }}
      >
        <defs>
          {/* Radial gradient for nucleus ambient glow */}
          <radialGradient id="nucleusAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d97757" stopOpacity="0.85" />
            <stop offset="65%" stopColor="#c96442" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#121110" stopOpacity="0" />
          </radialGradient>
          {/* Electron radial gradient */}
          <radialGradient id="electronParticle" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="35%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
          {/* Proton sphere gradient */}
          <radialGradient id="protonSphere" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="60%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </radialGradient>
          {/* Neutron sphere gradient */}
          <radialGradient id="neutronSphere" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="60%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
        </defs>

        {/* Subtle Background Coordinate Crosshair & Guide Rings */}
        <g opacity="0.08" stroke="#faf9f5" strokeWidth="0.8">
          <line x1="0" y1={cy} x2="660" y2={cy} strokeDasharray="4 4" />
          <line x1={cx} y1="0" x2={cx} y2="480" strokeDasharray="4 4" />
        </g>

        {/* Concentric Electron Orbital Shells */}
        {currentAtom.shells.map((count, sIdx) => {
          const r = shellRadii[sIdx] || 75 + sIdx * 55;
          // Angular speed: inner shells rotate faster by Kepler's law T ~ r^(3/2)
          const duration = 12 + sIdx * 7;
          // Radial indicator angle at -40 degrees (top-right quadrant) so labels NEVER hit electrons
          const labelAngle = -Math.PI * 0.22;
          const lx = cx + r * Math.cos(labelAngle);
          const ly = cy + r * Math.sin(labelAngle);

          return (
            <g key={`shell-${sIdx}`}>
              {/* Orbital Guide Circle */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(240, 237, 230, 0.2)"
                strokeWidth="1.2"
                strokeDasharray="5 5"
              />

              {/* Quantum Shell Callout Pill Badge at -40° */}
              {showLabels && (
                <g transform={`translate(${lx}, ${ly})`}>
                  <rect
                    x="-26"
                    y="-9"
                    width="52"
                    height="18"
                    rx="9"
                    fill="#181715"
                    stroke="rgba(217, 119, 87, 0.4)"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fill="#ede8df"
                    fontSize="9.5"
                    fontWeight="600"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {shellNames[sIdx]}
                  </text>
                </g>
              )}

              {/* Orbiting Group of Electrons */}
              <g
                style={
                  animate
                    ? {
                        transformOrigin: `${cx}px ${cy}px`,
                        animation: `rotateOrbit ${duration}s linear infinite`,
                      }
                    : undefined
                }
              >
                {Array.from({ length: count }).map((_, eIdx) => {
                  const angle = (2 * Math.PI * eIdx) / count;
                  const ex = cx + r * Math.cos(angle);
                  const ey = cy + r * Math.sin(angle);

                  return (
                    <g key={`electron-${sIdx}-${eIdx}`}>
                      {/* Cyan Glow Aura */}
                      <circle cx={ex} cy={ey} r="9" fill="rgba(56, 189, 248, 0.22)" />
                      {/* Particle Sphere */}
                      <circle cx={ex} cy={ey} r="5" fill="url(#electronParticle)" stroke="#38bdf8" strokeWidth="0.8" />
                      {/* Negative Sign */}
                      <text
                        x={ex}
                        y={ey + 2.5}
                        textAnchor="middle"
                        fill="#082f49"
                        fontSize="7"
                        fontWeight="bold"
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        -
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}

        {/* Central Atomic Nucleus */}
        <g>
          {/* Ambient Glow Aura */}
          <circle cx={cx} cy={cy} r="46" fill="url(#nucleusAura)" />

          {/* Densely Packed Protons & Neutrons */}
          {Array.from({ length: Math.min(currentAtom.z, 8) }).map((_, i) => {
            const angle = (i * 2 * Math.PI) / 8;
            const dist = i === 0 ? 0 : 15;
            const px = cx + dist * Math.cos(angle);
            const py = cy + dist * Math.sin(angle);
            return (
              <g key={`p-${i}`}>
                <circle cx={px} cy={py} r="8" fill="url(#protonSphere)" stroke="#7f1d1d" strokeWidth="0.8" />
                <text x={px} y={py + 3} textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
                  +
                </text>
              </g>
            );
          })}

          {Array.from({ length: Math.min(currentAtom.a - currentAtom.z, 8) }).map((_, i) => {
            const angle = (i * 2 * Math.PI) / 8 + 0.4;
            const dist = 17;
            const nx = cx + dist * Math.cos(angle);
            const ny = cy + dist * Math.sin(angle);
            return (
              <g key={`n-${i}`}>
                <circle cx={nx} cy={ny} r="7.5" fill="url(#neutronSphere)" stroke="#1e293b" strokeWidth="0.8" />
                <text x={nx} y={ny + 2.5} textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
                  n
                </text>
              </g>
            );
          })}

          {/* Chemical Symbol Center Badge */}
          <rect
            x={cx - 18}
            y={cy - 14}
            width="36"
            height="28"
            rx="6"
            fill="rgba(18, 17, 16, 0.92)"
            stroke="#d97757"
            strokeWidth="1.5"
          />
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fill="#faf9f5"
            fontSize="16"
            fontWeight="bold"
            fontFamily="'Newsreader', Georgia, serif"
          >
            {currentAtom.symbol}
          </text>
        </g>

        {/* Global Keyframes for Smooth Orbital Physics */}
        <style>{`
          @keyframes rotateOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );
  };

  // Render Molecular Geometry (Water H2O Dipole or Benzene C6H6)
  const renderMoleculeSvg = () => {
    if (moleculePreset === 'benzene') {
      return (
        <svg viewBox="0 0 660 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Benzene C6H6 Resonance Structure">
          <defs>
            <radialGradient id="carbonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#334155" />
            </radialGradient>
            <radialGradient id="hydrogenGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#faf9f5" />
              <stop offset="100%" stopColor="#b0aca2" />
            </radialGradient>
          </defs>

          {/* Hexagonal Planar Carbon Ring */}
          <polygon
            points="330,110 435,170 435,290 330,350 225,290 225,170"
            fill="none"
            stroke="#d97757"
            strokeWidth="4"
          />
          {/* Resonant Delocalized Pi-Electron Circular Orbit */}
          <circle cx="330" cy="230" r="72" fill="none" stroke="rgba(217, 119, 87, 0.65)" strokeWidth="3" strokeDasharray="8 5" />

          {/* C-H Outer Bonds */}
          <line x1="330" y1="110" x2="330" y2="40" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="435" y1="170" x2="496" y2="135" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="435" y1="290" x2="496" y2="325" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="330" y1="350" x2="330" y2="420" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="225" y1="290" x2="164" y2="325" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="225" y1="170" x2="164" y2="135" stroke="#b0aca2" strokeWidth="2.5" />

          {/* 6 Carbon Atoms */}
          {[
            [330, 110], [435, 170], [435, 290],
            [330, 350], [225, 290], [225, 170],
          ].map(([x, y], idx) => (
            <g key={`c-${idx}`}>
              <circle cx={x} cy={y} r="16" fill="url(#carbonGlow)" stroke="#1e293b" strokeWidth="1.5" />
              <text x={x} y={y + 5} textAnchor="middle" fill="#faf9f5" fontSize="13" fontWeight="bold" fontFamily="monospace">C</text>
            </g>
          ))}

          {/* 6 Hydrogen Atoms */}
          {[
            [330, 40], [496, 135], [496, 325],
            [330, 420], [164, 325], [164, 135],
          ].map(([x, y], idx) => (
            <g key={`h-${idx}`}>
              <circle cx={x} cy={y} r="12" fill="url(#hydrogenGlow)" stroke="#64748b" strokeWidth="1" />
              <text x={x} y={y + 4.5} textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="bold" fontFamily="monospace">H</text>
            </g>
          ))}
        </svg>
      );
    }

    // Default: Water Molecule (H2O Dipole)
    return (
      <svg viewBox="0 0 660 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Water Molecule (H2O) Dipole Structure">
        <defs>
          <radialGradient id="oxygenGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </radialGradient>
          <radialGradient id="hydrogenGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </radialGradient>
        </defs>

        {/* Covalent Single Bonds */}
        <line x1="330" y1="190" x2="210" y2="290" stroke="rgba(240, 237, 230, 0.4)" strokeWidth="8" strokeLinecap="round" />
        <line x1="330" y1="190" x2="450" y2="290" stroke="rgba(240, 237, 230, 0.4)" strokeWidth="8" strokeLinecap="round" />

        {/* Bond Angle Arc (104.5°) */}
        <path d="M 285 230 A 60 60 0 0 0 375 230" fill="none" stroke="#d97757" strokeWidth="2.5" strokeDasharray="4 4" />
        <text x="330" y="255" textAnchor="middle" fill="#d97757" fontSize="14" fontWeight="600" fontFamily="monospace">104.5°</text>

        {/* Central Oxygen Atom */}
        <circle cx="330" cy="190" r="48" fill="url(#oxygenGrad)" stroke="#7f1d1d" strokeWidth="2" />
        <text x="330" y="197" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="bold" fontFamily="monospace">O</text>
        <text x="330" y="125" textAnchor="middle" fill="#f87171" fontSize="15" fontWeight="bold" fontFamily="monospace">δ²⁻ (Partial Negative)</text>

        {/* Left Hydrogen Atom */}
        <circle cx="210" cy="290" r="30" fill="url(#hydrogenGrad)" stroke="#334155" strokeWidth="1.5" />
        <text x="210" y="297" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="bold" fontFamily="monospace">H</text>
        <text x="175" y="340" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="monospace">δ⁺</text>

        {/* Right Hydrogen Atom */}
        <circle cx="450" cy="290" r="30" fill="url(#hydrogenGrad)" stroke="#334155" strokeWidth="1.5" />
        <text x="450" y="297" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="bold" fontFamily="monospace">H</text>
        <text x="485" y="340" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="monospace">δ⁺</text>

        {/* Net Dipole Vector Arrow */}
        <g transform="translate(330, 370)">
          <line x1="0" y1="0" x2="0" y2="-55" stroke="#fbbf24" strokeWidth="3" strokeDasharray="6 3" />
          <polygon points="0,-62 -6,-50 6,-50" fill="#fbbf24" />
          <line x1="-10" y1="0" x2="10" y2="0" stroke="#fbbf24" strokeWidth="2.5" />
          <text x="18" y="-28" fill="#fbbf24" fontSize="12" fontWeight="600" fontFamily="monospace">
            Net Dipole (μ = 1.85 D)
          </text>
        </g>
      </svg>
    );
  };

  // Render Neural Network Topology
  const renderNeuralNetSvg = () => {
    const layers = [
      { name: 'Input Layer', count: 3, label: 'x' },
      { name: 'Hidden Layer 1', count: 5, label: 'h¹' },
      { name: 'Hidden Layer 2', count: 4, label: 'h²' },
      { name: 'Output Layer', count: 2, label: 'ŷ' },
    ];
    const layerX = [90, 250, 410, 560];

    return (
      <svg viewBox="0 0 660 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Deep Neural Network Schematic">
        {/* Synaptic Weights */}
        {layers.slice(0, -1).map((l, lIdx) => {
          const nextLayer = layers[lIdx + 1];
          const x1 = layerX[lIdx];
          const x2 = layerX[lIdx + 1];

          return (
            <g key={`conn-${lIdx}`}>
              {Array.from({ length: l.count }).map((_, i) => {
                const y1 = 90 + (250 / (l.count + 1)) * (i + 1);
                return Array.from({ length: nextLayer.count }).map((_, j) => {
                  const y2 = 90 + (250 / (nextLayer.count + 1)) * (j + 1);
                  return (
                    <line
                      key={`syn-${i}-${j}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="rgba(217, 119, 87, 0.28)"
                      strokeWidth="1.2"
                    />
                  );
                });
              })}
            </g>
          );
        })}

        {/* Layer Nodes */}
        {layers.map((l, lIdx) => {
          const x = layerX[lIdx];
          return (
            <g key={`layer-${lIdx}`}>
              <text x={x} y="55" textAnchor="middle" fill="#b0aca2" fontSize="11" fontWeight="600" fontFamily="monospace">
                {l.name}
              </text>

              {Array.from({ length: l.count }).map((_, i) => {
                const y = 90 + (250 / (l.count + 1)) * (i + 1);
                const isOutput = lIdx === layers.length - 1;
                const isInput = lIdx === 0;

                return (
                  <g key={`node-${lIdx}-${i}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r="16"
                      fill={isInput ? '#1e293b' : isOutput ? '#065f46' : '#831843'}
                      stroke={isInput ? '#38bdf8' : isOutput ? '#34d399' : '#f43f5e'}
                      strokeWidth="1.8"
                    />
                    <text
                      x={x}
                      y={y + 4.5}
                      textAnchor="middle"
                      fill="#faf9f5"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {l.label}_{i + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  };

  // Render Raw/Custom SVG string
  const renderCustomSvg = () => {
    if (!code) return <div style={{ color: '#b0aca2', padding: '20px' }}>No SVG code provided</div>;
    return (
      <div
        dangerouslySetInnerHTML={{ __html: code }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      />
    );
  };

  return (
    <div className="universal-diagram-card">
      {/* Top Header Row 1: Title & Toolbar */}
      <div className="universal-diagram-header">
        <div className="universal-diagram-title-wrap">
          <span className="universal-diagram-badge">
            {normalizedType === 'atom'
              ? 'ATOMIC MODEL'
              : normalizedType === 'molecule'
              ? 'MOLECULAR STRUCTURE'
              : normalizedType === 'neural-net'
              ? 'NEURAL ARCHITECTURE'
              : 'SCIENTIFIC SCHEMATIC'}
          </span>
          <span className="universal-diagram-title">
            {title ||
              (normalizedType === 'atom'
                ? `Bohr Model: ${currentAtom.name} (${currentAtom.symbol}, Z=${currentAtom.z})`
                : normalizedType === 'molecule'
                ? `Molecular Geometry: ${moleculePreset.toUpperCase()}`
                : normalizedType === 'neural-net'
                ? 'Deep Neural Network Topology'
                : 'Universal Visual Schematic')}
          </span>
        </div>

        {/* Action Controls */}
        <div className="universal-diagram-actions">
          {normalizedType === 'atom' && (
            <button
              type="button"
              className={`universal-diagram-btn ${animate ? 'universal-diagram-btn--active' : ''}`}
              onClick={() => setAnimate((a) => !a)}
              title={animate ? 'Pause orbital motion' : 'Start orbital motion'}
            >
              {animate ? '⏸ Pause' : '▶ Animate'}
            </button>
          )}

          <button
            type="button"
            className={`universal-diagram-btn ${showLabels ? 'universal-diagram-btn--active' : ''}`}
            onClick={() => setShowLabels((l) => !l)}
            title="Toggle scientific labels"
          >
            🏷 Labels
          </button>

          {/* Zoom In / Out */}
          <button
            type="button"
            className="universal-diagram-btn"
            onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.15))}
            title="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            className="universal-diagram-btn"
            onClick={() => setZoomLevel(1)}
            title="Reset zoom to 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            type="button"
            className="universal-diagram-btn"
            onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
            title="Zoom in"
          >
            +
          </button>

          {/* Export PNG */}
          <button type="button" className="universal-diagram-btn" onClick={handleExportPng} title="Download 2x Retina PNG">
            📷 PNG
          </button>

          {/* Export SVG */}
          <button type="button" className="universal-diagram-btn" onClick={handleExportSvg} title="Download Scalable Vector SVG">
            📐 SVG
          </button>

          {/* Copy SVG Code */}
          <button type="button" className="universal-diagram-btn" onClick={handleCopy} title="Copy SVG Code">
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Row 2: Elements Switcher Pills for Atoms */}
      {normalizedType === 'atom' && (
        <div className="universal-diagram-presets-bar">
          <span className="universal-diagram-presets-label">Elements:</span>
          {ATOM_PRESETS.map((p, idx) => (
            <button
              key={p.symbol}
              type="button"
              className={`universal-diagram-preset-pill ${atomIndex === idx ? 'universal-diagram-preset-pill--active' : ''}`}
              onClick={() => setAtomIndex(idx)}
            >
              {p.symbol} ({p.name})
            </button>
          ))}
        </div>
      )}

      {/* Row 2: Molecule Selector */}
      {normalizedType === 'molecule' && (
        <div className="universal-diagram-presets-bar">
          <span className="universal-diagram-presets-label">Molecules:</span>
          <button
            type="button"
            className={`universal-diagram-preset-pill ${moleculePreset === 'water' ? 'universal-diagram-preset-pill--active' : ''}`}
            onClick={() => setMoleculePreset('water')}
          >
            H₂O (Water Dipole)
          </button>
          <button
            type="button"
            className={`universal-diagram-preset-pill ${moleculePreset === 'benzene' ? 'universal-diagram-preset-pill--active' : ''}`}
            onClick={() => setMoleculePreset('benzene')}
          >
            C₆H₆ (Benzene Ring)
          </button>
        </div>
      )}

      {/* Visual Canvas Stage (Scalable Transform) */}
      <div className="universal-diagram-viewport" ref={svgContainerRef}>
        <div
          className="universal-diagram-svg-wrap"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {normalizedType === 'atom' && renderAtomSvg()}
          {normalizedType === 'molecule' && renderMoleculeSvg()}
          {normalizedType === 'neural-net' && renderNeuralNetSvg()}
          {normalizedType === 'custom-svg' && renderCustomSvg()}
        </div>
      </div>

      {/* Editorial Scientific Data Cards (HTML + KaTeX: ZERO TEXT COLLAPSING) */}
      {normalizedType === 'atom' && (
        <div className="universal-diagram-editorial-panel">
          {/* Card 1: Nuclear Composition */}
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Nuclear Composition</span>
            <span className="universal-diagram-col-headline">
              {currentAtom.name} ({currentAtom.symbol})
            </span>
            <div className="universal-diagram-col-metric">
              Atomic Number (<strong>Z</strong>): {currentAtom.z} Protons (p⁺)
            </div>
            <div className="universal-diagram-col-metric">
              Neutrons (<strong>N</strong>): {currentAtom.a - currentAtom.z} n⁰ (Mass A={currentAtom.a})
            </div>
            <div className="universal-diagram-col-metric">
              Classification: {currentAtom.group}
            </div>
          </div>

          {/* Card 2: Quantum Shell Configuration */}
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Electron Configuration</span>
            <div
              className="universal-diagram-math-box"
              dangerouslySetInnerHTML={{ __html: renderMathHtml(currentAtom.config, true) }}
            />
            <div className="universal-diagram-col-metric" style={{ marginTop: '4px' }}>
              Occupancy: {currentAtom.shells.map((count, i) => `n=${i + 1} (${['K', 'L', 'M', 'N'][i]}): ${count}e⁻`).join(' | ')}
            </div>
            <div className="universal-diagram-col-metric">
              Valence Electrons: {currentAtom.shells[currentAtom.shells.length - 1]}e⁻
            </div>
          </div>

          {/* Card 3: Bohr Energy Levels */}
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Quantized Energy Levels</span>
            <div
              className="universal-diagram-math-box"
              dangerouslySetInnerHTML={{ __html: renderMathHtml('E_n = -\\frac{13.6\\,\\text{eV}}{n^2}', true) }}
            />
            <div className="universal-diagram-col-metric" style={{ marginTop: '4px' }}>
              Ground State (<strong>n=1</strong>): -13.60 eV
            </div>
            <div className="universal-diagram-col-metric">
              Photon Transition: <span dangerouslySetInnerHTML={{ __html: renderMathHtml('\\Delta E = h\\nu = \\frac{hc}{\\lambda}') }} />
            </div>
          </div>
        </div>
      )}

      {/* Molecular Data Card */}
      {normalizedType === 'molecule' && (
        <div className="universal-diagram-editorial-panel">
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Chemical Bonding</span>
            <span className="universal-diagram-col-headline">
              {moleculePreset === 'water' ? 'Water Dipole (H₂O)' : 'Benzene (C₆H₆)'}
            </span>
            <div className="universal-diagram-col-metric">
              {moleculePreset === 'water'
                ? 'Polar Covalent Single O-H Bonds'
                : 'Aromatic Planar sp² Ring (120°)'}
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Geometric Properties</span>
            <div className="universal-diagram-col-metric">
              {moleculePreset === 'water' ? 'Bond Angle: 104.5° Bent' : 'Bond Angle: 120.0° Planar'}
            </div>
            <div className="universal-diagram-col-metric">
              {moleculePreset === 'water' ? 'Dipole Moment: μ = 1.85 D' : 'Dipole Moment: μ = 0 D (Nonpolar)'}
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Analytical Energy</span>
            <div
              className="universal-diagram-math-box"
              dangerouslySetInnerHTML={{
                __html: renderMathHtml(
                  moleculePreset === 'water' ? '\\Delta E_{\\text{bond}} = 459\\,\\text{kJ/mol}' : 'E_{\\text{resonance}} = 152\\,\\text{kJ/mol}',
                  true
                ),
              }}
            />
          </div>
        </div>
      )}

      {/* Footer Legend */}
      <div className="universal-diagram-legend-row">
        <div className="universal-diagram-legend-item">
          <div className="universal-diagram-legend-dot" style={{ background: '#ef4444' }} />
          <span>Proton (p⁺)</span>
        </div>
        <div className="universal-diagram-legend-item">
          <div className="universal-diagram-legend-dot" style={{ background: '#64748b' }} />
          <span>Neutron (n⁰)</span>
        </div>
        <div className="universal-diagram-legend-item">
          <div className="universal-diagram-legend-dot" style={{ background: '#38bdf8' }} />
          <span>Electron (e⁻)</span>
        </div>
        <div className="universal-diagram-legend-item" style={{ marginLeft: 'auto' }}>
          <span>Radial Guide: Quantized Bohr Orbits (n = 1, 2, 3...)</span>
        </div>
      </div>
    </div>
  );
};
