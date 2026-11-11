import React, { useState, useRef, useMemo, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { AtomViewer3D } from './AtomViewer3D';
import './UniversalDiagramCard.css';

export interface UniversalDiagramProps {
  type?: 'atom' | 'atom-3d' | 'molecule' | 'cell' | 'circuit' | 'neural-net' | 'biological-neuron' | 'neuron' | 'architecture' | 'microcontroller' | 'custom-svg' | string;
  title?: string;
  code?: string;
  element?: string;
}

export interface AtomPreset {
  name: string;
  symbol: string;
  z: number;
  a: number;
  shells: number[];
  config: string;
  group: string;
  period: number;
}

export const ATOM_PRESETS: AtomPreset[] = [
  { name: 'Hydrogen', symbol: 'H', z: 1, a: 1, shells: [1], config: '1s^1', group: 'Reactive Nonmetal (Group 1)', period: 1 },
  { name: 'Helium', symbol: 'He', z: 2, a: 4, shells: [2], config: '1s^2', group: 'Noble Gas (Group 18)', period: 1 },
  { name: 'Lithium', symbol: 'Li', z: 3, a: 7, shells: [2, 1], config: '[\\text{He}]\\,2s^1', group: 'Alkali Metal (Group 1)', period: 2 },
  { name: 'Beryllium', symbol: 'Be', z: 4, a: 9, shells: [2, 2], config: '[\\text{He}]\\,2s^2', group: 'Alkaline Earth (Group 2)', period: 2 },
  { name: 'Boron', symbol: 'B', z: 5, a: 11, shells: [2, 3], config: '[\\text{He}]\\,2s^2\\,2p^1', group: 'Metalloid (Group 13)', period: 2 },
  { name: 'Carbon', symbol: 'C', z: 6, a: 12, shells: [2, 4], config: '[\\text{He}]\\,2s^2\\,2p^2', group: 'Reactive Nonmetal (Group 14)', period: 2 },
  { name: 'Nitrogen', symbol: 'N', z: 7, a: 14, shells: [2, 5], config: '[\\text{He}]\\,2s^2\\,2p^3', group: 'Pnictogen (Group 15)', period: 2 },
  { name: 'Oxygen', symbol: 'O', z: 8, a: 16, shells: [2, 6], config: '[\\text{He}]\\,2s^2\\,2p^4', group: 'Chalcogen (Group 16)', period: 2 },
  { name: 'Fluorine', symbol: 'F', z: 9, a: 19, shells: [2, 7], config: '[\\text{He}]\\,2s^2\\,2p^5', group: 'Halogen (Group 17)', period: 2 },
  { name: 'Neon', symbol: 'Ne', z: 10, a: 20, shells: [2, 8], config: '[\\text{He}]\\,2s^2\\,2p^6', group: 'Noble Gas (Group 18)', period: 2 },
  { name: 'Sodium', symbol: 'Na', z: 11, a: 23, shells: [2, 8, 1], config: '[\\text{Ne}]\\,3s^1', group: 'Alkali Metal (Group 1)', period: 3 },
  { name: 'Magnesium', symbol: 'Mg', z: 12, a: 24, shells: [2, 8, 2], config: '[\\text{Ne}]\\,3s^2', group: 'Alkaline Earth (Group 2)', period: 3 },
  { name: 'Aluminum', symbol: 'Al', z: 13, a: 27, shells: [2, 8, 3], config: '[\\text{Ne}]\\,3s^2\\,3p^1', group: 'Post-Transition Metal (Group 13)', period: 3 },
  { name: 'Silicon', symbol: 'Si', z: 14, a: 28, shells: [2, 8, 4], config: '[\\text{Ne}]\\,3s^2\\,3p^2', group: 'Metalloid (Group 14)', period: 3 },
  { name: 'Phosphorus', symbol: 'P', z: 15, a: 31, shells: [2, 8, 5], config: '[\\text{Ne}]\\,3s^2\\,3p^3', group: 'Pnictogen (Group 15)', period: 3 },
  { name: 'Sulfur', symbol: 'S', z: 16, a: 32, shells: [2, 8, 6], config: '[\\text{Ne}]\\,3s^2\\,3p^4', group: 'Chalcogen (Group 16)', period: 3 },
  { name: 'Chlorine', symbol: 'Cl', z: 17, a: 35, shells: [2, 8, 7], config: '[\\text{Ne}]\\,3s^2\\,3p^5', group: 'Halogen (Group 17)', period: 3 },
  { name: 'Argon', symbol: 'Ar', z: 18, a: 40, shells: [2, 8, 8], config: '[\\text{Ne}]\\,3s^2\\,3p^6', group: 'Noble Gas (Group 18)', period: 3 },
  { name: 'Potassium', symbol: 'K', z: 19, a: 39, shells: [2, 8, 8, 1], config: '[\\text{Ar}]\\,4s^1', group: 'Alkali Metal (Group 1)', period: 4 },
  { name: 'Calcium', symbol: 'Ca', z: 20, a: 40, shells: [2, 8, 8, 2], config: '[\\text{Ar}]\\,4s^2', group: 'Alkaline Earth (Group 2)', period: 4 },
  { name: 'Titanium', symbol: 'Ti', z: 22, a: 48, shells: [2, 8, 10, 2], config: '[\\text{Ar}]\\,3d^2\\,4s^2', group: 'Transition Metal (Group 4)', period: 4 },
  { name: 'Iron', symbol: 'Fe', z: 26, a: 56, shells: [2, 8, 14, 2], config: '[\\text{Ar}]\\,3d^6\\,4s^2', group: 'Transition Metal (Group 8)', period: 4 },
  { name: 'Copper', symbol: 'Cu', z: 29, a: 64, shells: [2, 8, 18, 1], config: '[\\text{Ar}]\\,3d^{10}\\,4s^1', group: 'Transition Metal (Group 11)', period: 4 },
  { name: 'Zinc', symbol: 'Zn', z: 30, a: 65, shells: [2, 8, 18, 2], config: '[\\text{Ar}]\\,3d^{10}\\,4s^2', group: 'Transition Metal (Group 12)', period: 4 },
  { name: 'Krypton', symbol: 'Kr', z: 36, a: 84, shells: [2, 8, 18, 8], config: '[\\text{Ar}]\\,3d^{10}\\,4s^2\\,4p^6', group: 'Noble Gas (Group 18)', period: 4 },
  { name: 'Silver', symbol: 'Ag', z: 47, a: 108, shells: [2, 8, 18, 18, 1], config: '[\\text{Kr}]\\,4d^{10}\\,5s^1', group: 'Transition Metal (Group 11)', period: 5 },
  { name: 'Gold', symbol: 'Au', z: 79, a: 197, shells: [2, 8, 18, 32, 18, 1], config: '[\\text{Xe}]\\,4f^{14}\\,5d^{10}\\,6s^1', group: 'Transition Metal (Group 11)', period: 6 },
];

export function resolveAtomIndex(elemName?: string): number {
  if (!elemName) return 17; // Argon is index 17
  const clean = elemName.trim().toLowerCase();
  // Exact match on symbol or name
  const idx = ATOM_PRESETS.findIndex(
    (a) => a.name.toLowerCase() === clean || a.symbol.toLowerCase() === clean
  );
  if (idx >= 0) return idx;
  // Partial match
  const pIdx = ATOM_PRESETS.findIndex((a) => a.name.toLowerCase().includes(clean));
  if (pIdx >= 0) return pIdx;
  return 17; // Default to Argon
}

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
  element = 'Argon',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [animate, setAnimate] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Selected atom preset with reactive prop synchronization
  const [atomIndex, setAtomIndex] = useState<number>(() => resolveAtomIndex(element));

  useEffect(() => {
    setAtomIndex(resolveAtomIndex(element));
  }, [element]);

  // Determine if 3D orbital WebGL view is requested
  const wants3D = useMemo(() => {
    const combined = `${type} ${title || ''} ${code || ''} ${element || ''}`.toLowerCase();
    return combined.includes('3d') || combined.includes('atom-3d') || type === 'atom-3d';
  }, [type, title, code, element]);

  const [is3DMode, setIs3DMode] = useState<boolean>(() => wants3D);

  useEffect(() => {
    if (wants3D) {
      setIs3DMode(true);
    }
  }, [wants3D]);

  // Selected molecule preset
  const [moleculePreset, setMoleculePreset] = useState<'water' | 'benzene'>('water');

  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  // Detect diagram type
  const normalizedType = useMemo(() => {
    const lower = (type || '').toLowerCase();
    const lowerCode = (code || '').toLowerCase();
    const lowerTitle = (title || '').toLowerCase();
    const fullContext = `${lower} ${lowerTitle} ${lowerCode}`;

    if (lower.includes('atom') || lowerCode.includes('type: atom') || lowerCode.includes('bohr')) return 'atom';
    if (lower.includes('molecule') || lowerCode.includes('type: molecule') || lowerCode.includes('benzene') || lowerCode.includes('water')) return 'molecule';
    
    // Disambiguate Biological Neuroanatomy vs Machine Learning Artificial Neural Networks
    const isBioNeuron =
      /neuron|biological|nervous|glial|glia|soma|axon|dendrite|myelin|ranvier|synapse|schwann|astrocyte|neurotransmitter|saltatory|action\s*potential|membrane\s*potential/i.test(fullContext) &&
      !/deep\s*learning|perceptron|artificial|mlp|backprop|cnn|rnn|layer\s*weights|epoch|training\s*loss/i.test(fullContext);

    if (
      isBioNeuron ||
      lower.includes('biological-neuron') ||
      lower.includes('neuron') ||
      lowerCode.includes('type: biological-neuron') ||
      lowerCode.includes('type: neuron')
    ) {
      return 'biological-neuron';
    }

    if (fullContext.includes('neural') || lowerCode.includes('type: neural')) return 'neural-net';
    if (
      lower.includes('architecture') ||
      lower.includes('microcontroller') ||
      lower.includes('esp32') ||
      lower.includes('cpu') ||
      lower.includes('soc') ||
      lower.includes('hardware') ||
      lowerCode.includes('type: architecture') ||
      lowerCode.includes('type: microcontroller') ||
      lowerCode.includes('esp32') ||
      lowerCode.includes('pro_cpu') ||
      lowerCode.includes('app_cpu') ||
      lowerCode.includes('xtensa')
    ) {
      return 'architecture';
    }
    if (code && code.trim().startsWith('<svg')) return 'custom-svg';
    return 'atom';
  }, [type, title, code]);

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
    const cy = 250;
    // Generous radial spacing supporting up to 6 quantum shells without collisions
    const shellRadii = [65, 110, 155, 195, 230, 260];
    const shellNames = ['K (n=1)', 'L (n=2)', 'M (n=3)', 'N (n=4)', 'O (n=5)', 'P (n=6)'];

    return (
      <svg
        viewBox="0 0 660 500"
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

  // Render Anatomically Accurate Multipolar Biological Neuron & Glial Architecture
  const renderBiologicalNeuronSvg = () => {
    return (
      <svg width="100%" height="370" viewBox="0 0 760 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Biological Neuron and Glial Architecture Schematic">
        <defs>
          <linearGradient id="bioSomaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97757" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#9a3412" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="bioMyelinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#0284c7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="bioCapillaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#be123c" stopOpacity="0.9" />
          </linearGradient>
          <filter id="bioDropShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Outer Canvas Frame */}
        <rect x="8" y="8" width="744" height="364" rx="10" fill="#141312" stroke="rgba(255,255,255,0.06)" />

        {/* Top Glial Support Zone: Blood Capillary & Astrocyte */}
        {/* Blood Capillary Vessel */}
        <g transform="translate(300, 24)">
          <rect x="0" y="0" width="220" height="22" rx="11" fill="url(#bioCapillaryGrad)" stroke="#f43f5e" strokeWidth="1.2" />
          <text x="110" y="15" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Cerebral Blood Capillary (Blood-Brain Barrier)
          </text>
        </g>

        {/* Astrocyte Glial Cell */}
        <g transform="translate(380, 85)" filter="url(#bioDropShadow)">
          {/* Perivascular End-feet extending up to capillary */}
          <path d="M-15,-10 Q -30,-40 -50,-50" fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="-50" cy="-50" rx="8" ry="4" fill="#a855f7" />
          <path d="M15,-10 Q 30,-40 60,-50" fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="60" cy="-50" rx="8" ry="4" fill="#a855f7" />

          {/* Processes extending down to Node of Ranvier and Axon */}
          <path d="M-10,15 Q -25,45 -35,75" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M10,15 Q 35,45 55,75" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M-20,0 Q -60,10 -90,40" fill="none" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" />

          {/* Astrocyte Star-shaped Cell Body & Nucleus */}
          <circle cx="0" cy="0" r="14" fill="#7e22ce" stroke="#c084fc" strokeWidth="2" />
          <circle cx="0" cy="0" r="5" fill="#e9d5ff" />
          <text x="0" y="-18" fill="#c084fc" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Astrocyte (Glial Cell)
          </text>
          <text x="0" y="28" fill="#d8b4fe" fontSize="8.5" textAnchor="middle" fontFamily="monospace">
            K⁺ Buffering &amp; Glutamate Uptake
          </text>
        </g>

        {/* Receptive Synaptic Input Signals Arriving at Dendrites */}
        <g transform="translate(35, 60)">
          <path d="M0,0 L40,30" stroke="#34d399" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="45" cy="33" r="4" fill="#34d399" />
          <text x="0" y="-6" fill="#34d399" fontSize="9" fontWeight="bold" fontFamily="monospace">
            + EPSP (Excitatory)
          </text>
        </g>
        <g transform="translate(25, 275)">
          <path d="M0,0 L45,-25" stroke="#f43f5e" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="50" cy="-28" r="4" fill="#f43f5e" />
          <text x="0" y="16" fill="#f43f5e" fontSize="9" fontWeight="bold" fontFamily="monospace">
            - IPSP (Inhibitory)
          </text>
        </g>

        {/* Dendritic Tree (Branching Left from Soma) */}
        <g stroke="#d97757" strokeLinecap="round" fill="none">
          {/* Upper primary dendrite */}
          <path d="M165,185 Q 120,150 85,115" strokeWidth="6" />
          <path d="M85,115 Q 60,95 35,80" strokeWidth="3.5" />
          <path d="M85,115 Q 65,135 45,150" strokeWidth="3" />
          <path d="M120,150 Q 95,175 60,190" strokeWidth="3" />

          {/* Dendritic spines (tiny receptive protrusions) */}
          <line x1="80" y1="110" x2="74" y2="104" strokeWidth="2" stroke="#ea580c" />
          <circle cx="73" cy="103" r="2" fill="#fed7aa" stroke="none" />
          <line x1="50" y1="90" x2="45" y2="84" strokeWidth="2" stroke="#ea580c" />
          <circle cx="44" cy="83" r="2" fill="#fed7aa" stroke="none" />
          <line x1="55" y1="140" x2="50" y2="146" strokeWidth="2" stroke="#ea580c" />
          <circle cx="49" cy="147" r="2" fill="#fed7aa" stroke="none" />

          {/* Lower primary dendrite */}
          <path d="M165,225 Q 125,255 85,285" strokeWidth="5.5" />
          <path d="M85,285 Q 65,305 40,320" strokeWidth="3" />
          <path d="M85,285 Q 70,265 45,250" strokeWidth="2.8" />
          <path d="M125,255 Q 105,290 80,315" strokeWidth="2.8" />

          {/* Dendritic spines on lower branch */}
          <line x1="80" y1="290" x2="75" y2="296" strokeWidth="2" stroke="#ea580c" />
          <circle cx="74" cy="297" r="2" fill="#fed7aa" stroke="none" />
          <line x1="55" y1="260" x2="49" y2="263" strokeWidth="2" stroke="#ea580c" />
          <circle cx="48" cy="264" r="2" fill="#fed7aa" stroke="none" />
        </g>
        <text x="65" y="55" fill="#f97316" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
          Dendrites &amp; Spines
        </text>
        <text x="65" y="70" fill="#a8a29e" fontSize="9" fontFamily="monospace">
          Receptive Field (Input)
        </text>

        {/* Soma (Cell Body) */}
        <g transform="translate(190, 205)" filter="url(#bioDropShadow)">
          {/* Organic Perikaryon / Soma Body */}
          <path
            d="M-30,-25 Q -10,-45 20,-30 Q 50,-15 55,10 Q 50,40 20,45 Q -15,48 -35,25 Q -50,0 -30,-25 Z"
            fill="url(#bioSomaGrad)"
            stroke="#ea580c"
            strokeWidth="2"
          />

          {/* Nissl Granules (Rough ER clusters for protein synthesis) */}
          <circle cx="-15" cy="-12" r="2.2" fill="#fecdd3" opacity="0.8" />
          <circle cx="-5" cy="-22" r="2" fill="#fecdd3" opacity="0.8" />
          <circle cx="22" cy="-10" r="2.2" fill="#fecdd3" opacity="0.8" />
          <circle cx="-18" cy="18" r="2.2" fill="#fecdd3" opacity="0.8" />
          <circle cx="5" cy="28" r="2" fill="#fecdd3" opacity="0.8" />
          <circle cx="28" cy="20" r="2" fill="#fecdd3" opacity="0.8" />

          {/* Nucleus */}
          <circle cx="2" cy="5" r="18" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.8" />
          {/* Nucleolus */}
          <circle cx="0" cy="3" r="6" fill="#93c5fd" />
          <circle cx="-2" cy="1" r="2" fill="#ffffff" opacity="0.7" />

          <text x="2" y="-38" fill="#faf9f5" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Soma (Cell Body)
          </text>
          <text x="2" y="52" fill="#fdba74" fontSize="9" textAnchor="middle" fontFamily="monospace">
            Nucleus &amp; Nissl Substance
          </text>
        </g>

        {/* Axon Hillock (Trigger Zone / Summation Point) */}
        <g transform="translate(245, 205)">
          <path d="M-5,-10 L30,-4 L30,4 L-5,10 Z" fill="#c2410c" stroke="#ea580c" strokeWidth="1.5" />
          <text x="14" y="-18" fill="#fbbf24" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Axon Hillock
          </text>
          <text x="14" y="-6" fill="#fde68a" fontSize="8" textAnchor="middle" fontFamily="monospace">
            Vth = -55 mV
          </text>
        </g>

        {/* Central Axon Fiber Cylinder */}
        <rect x="275" y="201" width="350" height="8" rx="3" fill="#fed7aa" stroke="#f97316" strokeWidth="1" />

        {/* Myelin Sheaths (Schwann Cells / Oligodendrocytes) */}
        {/* Segment 1 */}
        <g transform="translate(285, 187)" filter="url(#bioDropShadow)">
          <rect x="0" y="0" width="70" height="36" rx="8" fill="url(#bioMyelinGrad)" stroke="#38bdf8" strokeWidth="1.6" />
          <ellipse cx="35" cy="8" rx="10" ry="4" fill="#0369a1" stroke="#7dd3fc" strokeWidth="1" />
          <text x="35" y="26" fill="#f0f9ff" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            MYELIN #1
          </text>
        </g>

        {/* Segment 2 */}
        <g transform="translate(375, 187)" filter="url(#bioDropShadow)">
          <rect x="0" y="0" width="70" height="36" rx="8" fill="url(#bioMyelinGrad)" stroke="#38bdf8" strokeWidth="1.6" />
          <ellipse cx="35" cy="8" rx="10" ry="4" fill="#0369a1" stroke="#7dd3fc" strokeWidth="1" />
          <text x="35" y="26" fill="#f0f9ff" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            MYELIN #2
          </text>
        </g>

        {/* Segment 3 */}
        <g transform="translate(465, 187)" filter="url(#bioDropShadow)">
          <rect x="0" y="0" width="70" height="36" rx="8" fill="url(#bioMyelinGrad)" stroke="#38bdf8" strokeWidth="1.6" />
          <ellipse cx="35" cy="8" rx="10" ry="4" fill="#0369a1" stroke="#7dd3fc" strokeWidth="1" />
          <text x="35" y="26" fill="#f0f9ff" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            MYELIN #3
          </text>
        </g>

        {/* Segment 4 */}
        <g transform="translate(555, 187)" filter="url(#bioDropShadow)">
          <rect x="0" y="0" width="65" height="36" rx="8" fill="url(#bioMyelinGrad)" stroke="#38bdf8" strokeWidth="1.6" />
          <ellipse cx="32" cy="8" rx="10" ry="4" fill="#0369a1" stroke="#7dd3fc" strokeWidth="1" />
          <text x="32" y="26" fill="#f0f9ff" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            MYELIN #4
          </text>
        </g>

        {/* Nodes of Ranvier (Exposed Gaps with Na+ Influx) */}
        {/* Node 1 */}
        <g transform="translate(365, 205)">
          <text x="0" y="32" fill="#facc15" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            Node #1
          </text>
          <text x="0" y="44" fill="#fef08a" fontSize="7.5" textAnchor="middle" fontFamily="sans-serif">
            Na⁺ Influx
          </text>
          <path d="M0,8 L0,18" stroke="#facc15" strokeWidth="1.5" />
        </g>

        {/* Node 2 */}
        <g transform="translate(455, 205)">
          <text x="0" y="32" fill="#facc15" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            Node #2
          </text>
          <text x="0" y="44" fill="#fef08a" fontSize="7.5" textAnchor="middle" fontFamily="sans-serif">
            Na⁺ Influx
          </text>
          <path d="M0,8 L0,18" stroke="#facc15" strokeWidth="1.5" />
        </g>

        {/* Node 3 */}
        <g transform="translate(545, 205)">
          <text x="0" y="32" fill="#facc15" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            Node #3
          </text>
          <text x="0" y="44" fill="#fef08a" fontSize="7.5" textAnchor="middle" fontFamily="sans-serif">
            Na⁺ Influx
          </text>
          <path d="M0,8 L0,18" stroke="#facc15" strokeWidth="1.5" />
        </g>

        {/* Saltatory Conduction Leaping Arcs (Action Potential Jumping from Node to Node) */}
        <g fill="none" stroke="#fde047" strokeWidth="2" strokeDasharray="4 2">
          {/* Leap 1: Hillock to Node 1 */}
          <path d="M275,183 Q 320,155 365,183" />
          {/* Leap 2: Node 1 to Node 2 */}
          <path d="M365,183 Q 410,155 455,183" />
          {/* Leap 3: Node 2 to Node 3 */}
          <path d="M455,183 Q 500,155 545,183" />
          {/* Leap 4: Node 3 to Terminal */}
          <path d="M545,183 Q 585,155 625,183" />
        </g>
        {/* Animated Traveling Action Potential Pulse */}
        <circle cx="275" cy="183" r="4.5" fill="#fef08a" filter="url(#bioDropShadow)">
          <animate attributeName="cx" values="275;365;455;545;625" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <text x="455" y="152" fill="#fde047" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="-apple-system, sans-serif">
          ⚡ Saltatory Conduction (Up to 120 m/s)
        </text>

        {/* Axon Terminal & Synaptic Boutons */}
        <g stroke="#34d399" strokeLinecap="round" fill="none">
          <path d="M620,205 Q 645,180 670,160" strokeWidth="3" />
          <path d="M620,205 Q 650,205 680,205" strokeWidth="3.5" />
          <path d="M620,205 Q 645,230 670,250" strokeWidth="3" />
        </g>
        {/* Synaptic Bouton Bulbs */}
        <circle cx="672" cy="158" r="6" fill="#065f46" stroke="#34d399" strokeWidth="1.8" />
        <circle cx="682" cy="205" r="7" fill="#065f46" stroke="#34d399" strokeWidth="2" />
        <circle cx="672" cy="252" r="6" fill="#065f46" stroke="#34d399" strokeWidth="1.8" />

        {/* Detail Callout of Synaptic Cleft at (682, 205) */}
        <g transform="translate(620, 265)">
          <rect x="0" y="0" width="125" height="52" rx="6" fill="#0f172a" stroke="#34d399" strokeWidth="1.2" />
          <text x="62" y="15" fill="#34d399" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Synaptic Cleft (20nm)
          </text>
          <text x="62" y="28" fill="#e2e8f0" fontSize="8" textAnchor="middle" fontFamily="monospace">
            Vesicular Exocytosis
          </text>
          <text x="62" y="42" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="sans-serif">
            ACh / Glutamate Release
          </text>
        </g>

        {/* Global Propagation Arrow Across Bottom */}
        <g transform="translate(140, 345)">
          <rect x="0" y="0" width="480" height="20" rx="4" fill="#1b1a18" stroke="rgba(255,255,255,0.08)" />
          <path d="M20,10 L460,10" stroke="#f97316" strokeWidth="2" strokeDasharray="6 4" />
          <polygon points="460,6 468,10 460,14" fill="#f97316" />
          <text x="240" y="14" fill="#faf9f5" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            Orthodromic Propagation: Dendrite ➔ Soma ➔ Axon Hillock ➔ Nodes of Ranvier ➔ Synapse
          </text>
        </g>
      </svg>
    );
  };

  // Render High-Precision Microcontroller / SoC System Architecture SVG
  const renderArchitectureSvg = () => {
    return (
      <svg width="100%" height="340" viewBox="0 0 720 370">
        <defs>
          <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97757" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#d97757" stopOpacity="0.8" />
          </linearGradient>
          <filter id="glowSubtle" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Outer Canvas Boundary */}
        <rect x="8" y="8" width="704" height="354" rx="10" fill="#141312" stroke="rgba(255,255,255,0.06)" />

        {/* Central 32-bit Internal System Crossbar Bus */}
        <g transform="translate(30, 172)">
          <rect x="0" y="0" width="660" height="20" rx="5" fill="#242220" stroke="url(#busGrad)" strokeWidth="1.8" filter="url(#glowSubtle)" />
          <text x="330" y="14" fill="#faf9f5" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace" letterSpacing="0.05em">
            32-BIT INTERNAL SYSTEM CROSSBAR & ADVANCED PERIPHERAL BUS (APB / DMA)
          </text>
          {/* Animated Glowing Data Packets Traveling the Bus */}
          <circle cx="60" cy="10" r="3.5" fill="#fde047">
            <animate attributeName="cx" from="60" to="620" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="580" cy="10" r="3" fill="#38bdf8">
            <animate attributeName="cx" from="580" to="80" dur="2.8s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Vertical Bus Interconnect Lines */}
        {/* Core 0 */}
        <line x1="130" y1="125" x2="130" y2="172" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="3 2" />
        {/* Core 1 */}
        <line x1="130" y1="192" x2="130" y2="235" stroke="#34d399" strokeWidth="2.5" strokeDasharray="3 2" />
        {/* System Memory */}
        <line x1="360" y1="125" x2="360" y2="172" stroke="#c084fc" strokeWidth="2.5" strokeDasharray="3 2" />
        {/* ULP Coprocessor */}
        <line x1="360" y1="192" x2="360" y2="235" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="3 2" />
        {/* Wi-Fi PHY */}
        <line x1="590" y1="125" x2="590" y2="172" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="3 2" />
        {/* GPIO Matrix */}
        <line x1="590" y1="192" x2="590" y2="235" stroke="#e879f9" strokeWidth="2.5" strokeDasharray="3 2" />

        {/* 1. Core 0: PRO_CPU (Top Left) */}
        <g transform="translate(35, 35)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#38bdf8" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(56, 189, 248, 0.14)" />
          <text x="12" y="17" fill="#38bdf8" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            Core 0: PRO_CPU
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            240 MHz
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            Xtensa 32-bit LX6 Core
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • 4-Stage Pipeline | FPU Unit
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • Wi-Fi/BT Protocol & RTOS Stack
          </text>
        </g>

        {/* 2. System Memory (Top Center) */}
        <g transform="translate(265, 35)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#c084fc" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(192, 132, 252, 0.14)" />
          <text x="12" y="17" fill="#c084fc" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            System Memory & MMU
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            520 KB
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            SRAM (520KB) & ROM (448KB)
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • Dedicated DMA Controller
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • Instruction & Data MMU Cache
          </text>
        </g>

        {/* 3. Wi-Fi / Bluetooth Radio PHY (Top Right) */}
        <g transform="translate(495, 35)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#fbbf24" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(251, 191, 36, 0.14)" />
          <text x="12" y="17" fill="#fbbf24" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            Wi-Fi / BT Baseband PHY
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            2.4 GHz
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            802.11 b/g/n & BLE 5.0
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • 150 Mbps PHY Data Rate
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • Hardware Cryptographic Accel
          </text>
        </g>

        {/* 4. Core 1: APP_CPU (Bottom Left) */}
        <g transform="translate(35, 235)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#34d399" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(52, 211, 153, 0.14)" />
          <text x="12" y="17" fill="#34d399" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            Core 1: APP_CPU
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            240 MHz
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            Xtensa 32-bit LX6 Core
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • User Application Thread
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • DSP Vector Extension Math
          </text>
        </g>

        {/* 5. ULP Coprocessor & RTC (Bottom Center - ZERO TRUNCATION, FULLY VISIBLE) */}
        <g transform="translate(265, 235)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#f43f5e" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(244, 63, 94, 0.14)" />
          <text x="12" y="17" fill="#f43f5e" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            ULP Coprocessor & RTC
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            8 MHz
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            Ultra-Low Power Controller
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • Deep-Sleep ADC / Touch Sensing
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • 8 KB Fast/Slow RTC Memory
          </text>
        </g>

        {/* 6. GPIO Matrix & Peripherals (Bottom Right) */}
        <g transform="translate(495, 235)" filter="url(#glowSubtle)">
          <rect x="0" y="0" width="190" height="90" rx="8" fill="#1b1a18" stroke="#e879f9" strokeWidth="1.6" />
          <rect x="0" y="0" width="190" height="26" rx="8" fill="rgba(232, 121, 249, 0.14)" />
          <text x="12" y="17" fill="#e879f9" fontSize="11" fontWeight="bold" fontFamily="-apple-system, sans-serif">
            GPIO Matrix & Peripheral Bus
          </text>
          <text x="178" y="17" fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
            36× I/O
          </text>
          <text x="12" y="44" fill="#faf9f5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            Hardware Peripheral Interfaces
          </text>
          <text x="12" y="60" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • 4× SPI, 2× I2C, 3× UART, 2× I2S
          </text>
          <text x="12" y="75" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            • 12-bit SAR ADC & 8-bit DAC
          </text>
        </g>
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
              : normalizedType === 'biological-neuron'
              ? 'NEUROBIOLOGY SCHEMATIC'
              : normalizedType === 'neural-net'
              ? 'NEURAL ARCHITECTURE'
              : normalizedType === 'architecture'
              ? 'SYSTEM ARCHITECTURE'
              : 'SCIENTIFIC SCHEMATIC'}
          </span>
          <span className="universal-diagram-title">
            {title ||
              (normalizedType === 'atom'
                ? `Bohr Model: ${currentAtom.name} (${currentAtom.symbol}, Z=${currentAtom.z})`
                : normalizedType === 'molecule'
                ? `Molecular Geometry: ${moleculePreset.toUpperCase()}`
                : normalizedType === 'biological-neuron'
                ? 'Biological Multipolar Neuron & Glial Architecture'
                : normalizedType === 'neural-net'
                ? 'Deep Neural Network Topology'
                : normalizedType === 'architecture'
                ? 'Dual-Core Microcontroller Architecture (SoC Crossbar Bus)'
                : 'Universal Visual Schematic')}
          </span>
        </div>

        {/* Action Controls */}
        <div className="universal-diagram-actions">
          {normalizedType === 'atom' && (
            <button
              type="button"
              className={`universal-diagram-btn ${is3DMode ? 'universal-diagram-btn--active' : ''}`}
              onClick={() => setIs3DMode((m) => !m)}
              title={is3DMode ? 'Switch to 2D Bohr Vector Model' : 'Switch to Interactive 3D WebGL Orbitals'}
            >
              {is3DMode ? '🪐 3D Orbitals' : '📐 2D Bohr'}
            </button>
          )}

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

      {/* Row 2: Subsystem Badges for Architecture */}
      {normalizedType === 'architecture' && (
        <div className="universal-diagram-presets-bar">
          <span className="universal-diagram-presets-label">Subsystems:</span>
          <span className="universal-diagram-preset-pill universal-diagram-preset-pill--active">
            Dual Xtensa LX6 (240 MHz)
          </span>
          <span className="universal-diagram-preset-pill">
            520KB SRAM MMU
          </span>
          <span className="universal-diagram-preset-pill">
            Wi-Fi / BT 5.0 PHY
          </span>
          <span className="universal-diagram-preset-pill">
            ULP Coprocessor (Deep Sleep)
          </span>
          <span className="universal-diagram-preset-pill">
            GPIO Matrix (36× I/O)
          </span>
        </div>
      )}

      {/* Row 2: Cellular Component Badges for Biological Neuroanatomy */}
      {normalizedType === 'biological-neuron' && (
        <div className="universal-diagram-presets-bar">
          <span className="universal-diagram-presets-label">Cellular Architecture:</span>
          <span className="universal-diagram-preset-pill universal-diagram-preset-pill--active">
            Dendrites &amp; Spines (Receptive Field)
          </span>
          <span className="universal-diagram-preset-pill">
            Soma &amp; Nucleus (Metabolism)
          </span>
          <span className="universal-diagram-preset-pill">
            Axon Hillock (Trigger Zone / Vth -55mV)
          </span>
          <span className="universal-diagram-preset-pill">
            Myelin Sheaths &amp; Nodes of Ranvier
          </span>
          <span className="universal-diagram-preset-pill">
            Synaptic Boutons (Exocytosis)
          </span>
          <span className="universal-diagram-preset-pill">
            Astrocyte Glia (BBB Coupling)
          </span>
        </div>
      )}

      {/* Visual Canvas Stage (Scalable Transform) */}
      <div className="universal-diagram-viewport" ref={svgContainerRef}>
        {normalizedType === 'atom' && is3DMode ? (
          <AtomViewer3D
            atom={currentAtom}
            animate={animate}
            showLabels={showLabels}
          />
        ) : (
          <div
            className="universal-diagram-svg-wrap"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            {normalizedType === 'atom' && renderAtomSvg()}
            {normalizedType === 'molecule' && renderMoleculeSvg()}
            {normalizedType === 'biological-neuron' && renderBiologicalNeuronSvg()}
            {normalizedType === 'neural-net' && renderNeuralNetSvg()}
            {normalizedType === 'architecture' && renderArchitectureSvg()}
            {normalizedType === 'custom-svg' && renderCustomSvg()}
          </div>
        )}
      </div>

      {/* Editorial Scientific Data Cards for Biological Neuroanatomy */}
      {normalizedType === 'biological-neuron' && (
        <div className="universal-diagram-editorial-panel">
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Membrane Electrophysiology</span>
            <span className="universal-diagram-col-headline" style={{ color: '#38bdf8' }}>
              Resting Potential: -70 mV
            </span>
            <div className="universal-diagram-col-metric">
              Threshold: -55 mV (Voltage-Gated Na⁺ Activation)
            </div>
            <div className="universal-diagram-col-metric">
              Action Potential Peak: +30 mV (Rapid Depolarization)
            </div>
            <div className="universal-diagram-col-metric">
              Ion Gradient: Na⁺/K⁺-ATPase (3 Na⁺ out / 2 K⁺ in)
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Axonal Conduction Dynamics</span>
            <span className="universal-diagram-col-headline" style={{ color: '#fbbf24' }}>
              Saltatory Conduction (~120 m/s)
            </span>
            <div className="universal-diagram-col-metric">
              Myelin Sheath: Schwann cells (PNS) / Oligodendrocytes (CNS)
            </div>
            <div className="universal-diagram-col-metric">
              Nodes of Ranvier: Clustered Nav1.6 channels (~12,000/µm²)
            </div>
            <div className="universal-diagram-col-metric">
              Transmission: High-speed electrotonic leap between nodes
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Glial Architecture &amp; Synapse</span>
            <span className="universal-diagram-col-headline" style={{ color: '#c084fc' }}>
              Astrocytes &amp; Glial Ratio (~1:1)
            </span>
            <div className="universal-diagram-col-metric">
              Astrocytes: K⁺ buffering, glutamate uptake, blood-brain barrier
            </div>
            <div className="universal-diagram-col-metric">
              Synaptic Cleft: 20–40 nm gap, exocytotic vesicle release
            </div>
            <div className="universal-diagram-col-metric">
              Neurotransmitters: Glutamate (excitatory), GABA (inhibitory)
            </div>
          </div>
        </div>
      )}

      {/* Editorial Scientific Data Cards for Microcontroller Architecture */}
      {normalizedType === 'architecture' && (
        <div className="universal-diagram-editorial-panel">
          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">CPU Compute Architecture</span>
            <span className="universal-diagram-col-headline" style={{ color: '#38bdf8' }}>
              Dual 32-bit Xtensa LX6
            </span>
            <div className="universal-diagram-col-metric">
              Clock Speed: 240 MHz (up to 600 DMIPS)
            </div>
            <div className="universal-diagram-col-metric">
              Core Roles: PRO_CPU (Protocol) & APP_CPU (App)
            </div>
            <div className="universal-diagram-col-metric">
              Pipeline: 4-stage pipeline with hardware FPU
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Memory & Bus Hierarchy</span>
            <span className="universal-diagram-col-headline" style={{ color: '#c084fc' }}>
              520 KB SRAM / 448 KB ROM
            </span>
            <div className="universal-diagram-col-metric">
              Crossbar Bus: 32-bit Multi-Master APB/DMA
            </div>
            <div className="universal-diagram-col-metric">
              Memory MMU: Flash & PSRAM external caching
            </div>
            <div className="universal-diagram-col-metric">
              Throughput: Zero-wait state internal SRAM
            </div>
          </div>

          <div className="universal-diagram-card-column">
            <span className="universal-diagram-col-title">Ultra-Low Power & Sensing</span>
            <span className="universal-diagram-col-headline" style={{ color: '#f43f5e' }}>
              ULP Coprocessor & RTC
            </span>
            <div className="universal-diagram-col-metric">
              Deep Sleep Current: &lt; 5 µA continuous
            </div>
            <div className="universal-diagram-col-metric">
              Sensing: Autonomous ADC / Touch polling
            </div>
            <div className="universal-diagram-col-metric">
              Wakeup: Threshold interrupt to main cores
            </div>
          </div>
        </div>
      )}

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

      {/* Footer Legend - STRICTLY ONLY for Bohr Atomic Models */}
      {normalizedType === 'atom' && (
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
      )}
    </div>
  );
};
