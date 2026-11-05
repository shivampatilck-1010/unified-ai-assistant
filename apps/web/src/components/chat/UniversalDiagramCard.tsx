import React, { useState, useRef, useMemo } from 'react';
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
}

const ATOM_PRESETS: AtomPreset[] = [
  { name: 'Hydrogen', symbol: 'H', z: 1, a: 1, shells: [1], config: '1s¹' },
  { name: 'Helium', symbol: 'He', z: 2, a: 4, shells: [2], config: '1s²' },
  { name: 'Carbon', symbol: 'C', z: 6, a: 12, shells: [2, 4], config: '[He] 2s² 2p²' },
  { name: 'Nitrogen', symbol: 'N', z: 7, a: 14, shells: [2, 5], config: '[He] 2s² 2p³' },
  { name: 'Oxygen', symbol: 'O', z: 8, a: 16, shells: [2, 6], config: '[He] 2s² 2p⁴' },
  { name: 'Sodium', symbol: 'Na', z: 11, a: 23, shells: [2, 8, 1], config: '[Ne] 3s¹' },
  { name: 'Silicon', symbol: 'Si', z: 14, a: 28, shells: [2, 8, 4], config: '[Ne] 3s² 3p²' },
  { name: 'Chlorine', symbol: 'Cl', z: 17, a: 35, shells: [2, 8, 7], config: '[Ne] 3s² 3p⁵' },
  { name: 'Calcium', symbol: 'Ca', z: 20, a: 40, shells: [2, 8, 8, 2], config: '[Ar] 4s²' },
];

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
    return idx >= 0 ? idx : 2; // Default to Carbon
  });

  // Selected molecule preset
  const [moleculePreset, setMoleculePreset] = useState<'water' | 'benzene' | 'methane'>('water');

  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  // Detect diagram type
  const normalizedType = useMemo(() => {
    const lower = (type || '').toLowerCase();
    const lowerCode = (code || '').toLowerCase();
    if (lower.includes('atom') || lowerCode.includes('type: atom') || lowerCode.includes('bohr')) return 'atom';
    if (lower.includes('molecule') || lowerCode.includes('type: molecule') || lowerCode.includes('benzene') || lowerCode.includes('water')) return 'molecule';
    if (lower.includes('cell') || lowerCode.includes('type: cell') || lowerCode.includes('chloroplast')) return 'cell';
    if (lower.includes('circuit') || lowerCode.includes('type: circuit')) return 'circuit';
    if (lower.includes('neural') || lowerCode.includes('type: neural')) return 'neural-net';
    if (code && code.trim().startsWith('<svg')) return 'custom-svg';
    return 'atom';
  }, [type, code]);

  const currentAtom = ATOM_PRESETS[atomIndex];

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
      const scale = 2; // Retina 2x
      canvas.width = (svgElem.clientWidth || 600) * scale;
      canvas.height = (svgElem.clientHeight || 450) * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#141311';
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

  // Render Bohr Atom Diagram
  const renderAtomSvg = () => {
    const cx = 300;
    const cy = 230;
    const baseRadius = 55;
    const shellGap = 38;

    return (
      <svg viewBox="0 0 600 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Bohr model of ${currentAtom.name}`}>
        <defs>
          {/* Radial gradient for nucleus */}
          <radialGradient id="nucleusGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d97757" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#c96442" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1f1e1c" stopOpacity="0.1" />
          </radialGradient>
          {/* Radial gradient for electrons */}
          <radialGradient id="electronGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
          {/* Proton gradient */}
          <radialGradient id="protonGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </radialGradient>
          {/* Neutron gradient */}
          <radialGradient id="neutronGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </radialGradient>
        </defs>

        {/* Background Grid Pattern */}
        <g opacity="0.08" stroke="#faf9f5" strokeWidth="0.5">
          <line x1="0" y1="230" x2="600" y2="230" strokeDasharray="3 3" />
          <line x1="300" y1="0" x2="300" y2="460" strokeDasharray="3 3" />
          <circle cx="300" cy="230" r="180" fill="none" strokeDasharray="2 4" />
        </g>

        {/* Concentric Electron Orbital Shells */}
        {currentAtom.shells.map((count, sIdx) => {
          const r = baseRadius + sIdx * shellGap;
          const shellNames = ['K (n=1)', 'L (n=2)', 'M (n=3)', 'N (n=4)'];
          const duration = 12 + sIdx * 6; // Inner shells rotate faster by Kepler's harmonic law

          return (
            <g key={`shell-${sIdx}`}>
              {/* Shell Orbit Guide Line */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(240, 237, 230, 0.22)"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />

              {/* Quantum Shell Label */}
              {showLabels && (
                <text
                  x={cx + r + 4}
                  y={cy - 4}
                  fill="#b0aca2"
                  fontSize="10"
                  fontFamily="monospace"
                  opacity="0.85"
                >
                  {shellNames[sIdx] || `n=${sIdx + 1}`}
                </text>
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
                      {/* Electron Outer Glow Halo */}
                      <circle cx={ex} cy={ey} r="8" fill="rgba(56, 189, 248, 0.25)" />
                      {/* Electron Particle Sphere */}
                      <circle cx={ex} cy={ey} r="4.5" fill="url(#electronGlow)" />
                      {/* Negative Charge Minus Sign */}
                      <text
                        x={ex}
                        y={ey + 2.5}
                        textAnchor="middle"
                        fill="#0c4a6e"
                        fontSize="7"
                        fontWeight="bold"
                        fontFamily="monospace"
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

        {/* Central Dense Nucleus */}
        <g>
          {/* Nucleus Glow Ambient Aura */}
          <circle cx={cx} cy={cy} r="34" fill="url(#nucleusGlow)" />

          {/* Densely Clustered Nucleons (Protons & Neutrons) */}
          {Array.from({ length: Math.min(currentAtom.z, 7) }).map((_, i) => {
            const angle = (i * 2 * Math.PI) / 7;
            const dist = i === 0 ? 0 : 12;
            const px = cx + dist * Math.cos(angle);
            const py = cy + dist * Math.sin(angle);
            return (
              <circle
                key={`p-${i}`}
                cx={px}
                cy={py}
                r="6.5"
                fill="url(#protonGrad)"
                stroke="#7f1d1d"
                strokeWidth="0.8"
              />
            );
          })}

          {Array.from({ length: Math.min(currentAtom.a - currentAtom.z, 7) }).map((_, i) => {
            const angle = (i * 2 * Math.PI) / 7 + 0.45;
            const dist = 14;
            const nx = cx + dist * Math.cos(angle);
            const ny = cy + dist * Math.sin(angle);
            return (
              <circle
                key={`n-${i}`}
                cx={nx}
                cy={ny}
                r="6"
                fill="url(#neutronGrad)"
                stroke="#1e293b"
                strokeWidth="0.8"
              />
            );
          })}

          {/* Central Chemical Symbol Badge */}
          <rect
            x={cx - 16}
            y={cy - 12}
            width="32"
            height="24"
            rx="5"
            fill="rgba(19, 18, 17, 0.85)"
            stroke="#d97757"
            strokeWidth="1.2"
          />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fill="#faf9f5"
            fontSize="14"
            fontWeight="bold"
            fontFamily="'Newsreader', Georgia, serif"
          >
            {currentAtom.symbol}
          </text>
        </g>

        {/* Top-Left Element Profile Callout */}
        {showLabels && (
          <g transform="translate(24, 28)">
            <rect width="180" height="74" rx="8" fill="#181715" stroke="rgba(240, 237, 230, 0.12)" strokeWidth="1" />
            <text x="14" y="22" fill="#faf9f5" fontSize="13" fontWeight="600" fontFamily="'Newsreader', Georgia, serif">
              {currentAtom.name} ({currentAtom.symbol})
            </text>
            <text x="14" y="40" fill="#b0aca2" fontSize="10.5" fontFamily="monospace">
              Atomic No (Z): {currentAtom.z} | Mass (A): {currentAtom.a}
            </text>
            <text x="14" y="58" fill="#d97757" fontSize="10.5" fontFamily="monospace">
              Config: {currentAtom.config}
            </text>
          </g>
        )}

        {/* Top-Right Energy Transitions Callout */}
        {showLabels && (
          <g transform="translate(390, 28)">
            <rect width="186" height="74" rx="8" fill="#181715" stroke="rgba(240, 237, 230, 0.12)" strokeWidth="1" />
            <text x="14" y="22" fill="#faf9f5" fontSize="11" fontWeight="600" fontFamily="'Newsreader', Georgia, serif">
              Bohr Energy Levels:
            </text>
            <text x="14" y="40" fill="#b0aca2" fontSize="10" fontFamily="monospace">
              E_n = -13.6 eV / n²
            </text>
            <text x="14" y="58" fill="#38bdf8" fontSize="10" fontFamily="monospace">
              ΔE = h·ν = h·c / λ (Photon emission)
            </text>
          </g>
        )}

        {/* Bottom Legend */}
        {showLabels && (
          <g transform="translate(24, 420)">
            <circle cx="10" cy="0" r="4.5" fill="#ef4444" />
            <text x="22" y="3" fill="#b0aca2" fontSize="10.5">Proton (p⁺)</text>

            <circle cx="105" cy="0" r="4.5" fill="#64748b" />
            <text x="117" y="3" fill="#b0aca2" fontSize="10.5">Neutron (n⁰)</text>

            <circle cx="205" cy="0" r="4.5" fill="#38bdf8" />
            <text x="217" y="3" fill="#b0aca2" fontSize="10.5">Electron (e⁻)</text>

            <line x1="310" y1="0" x2="330" y2="0" stroke="rgba(240, 237, 230, 0.4)" strokeDasharray="3 3" />
            <text x="338" y="3" fill="#b0aca2" fontSize="10.5">Quantized Shells (n=1,2,3...)</text>
          </g>
        )}

        <style>{`
          @keyframes rotateOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );
  };

  // Render Molecular Structure Diagram (Water, Benzene, Methane)
  const renderMoleculeSvg = () => {
    if (moleculePreset === 'benzene') {
      return (
        <svg viewBox="0 0 600 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Benzene Molecular Structure">
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

          {/* Hexagonal Carbon-Carbon Bonds */}
          <polygon
            points="300,110 395,165 395,275 300,330 205,275 205,165"
            fill="none"
            stroke="#d97757"
            strokeWidth="3.5"
          />
          {/* Inner Resonant Aromatic Pi-Electron Ring */}
          <circle cx="300" cy="220" r="62" fill="none" stroke="rgba(217, 119, 87, 0.6)" strokeWidth="2.5" strokeDasharray="6 4" />

          {/* C-H Bonds */}
          <line x1="300" y1="110" x2="300" y2="45" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="395" y1="165" x2="452" y2="132" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="395" y1="275" x2="452" y2="308" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="300" y1="330" x2="300" y2="395" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="205" y1="275" x2="148" y2="308" stroke="#b0aca2" strokeWidth="2.5" />
          <line x1="205" y1="165" x2="148" y2="132" stroke="#b0aca2" strokeWidth="2.5" />

          {/* 6 Carbon Atoms */}
          {[
            [300, 110], [395, 165], [395, 275],
            [300, 330], [205, 275], [205, 165],
          ].map(([x, y], idx) => (
            <g key={`c-${idx}`}>
              <circle cx={x} cy={y} r="14" fill="url(#carbonGlow)" stroke="#1e293b" strokeWidth="1.5" />
              <text x={x} y={y + 4.5} textAnchor="middle" fill="#faf9f5" fontSize="12" fontWeight="bold" fontFamily="monospace">C</text>
            </g>
          ))}

          {/* 6 Hydrogen Atoms */}
          {[
            [300, 45], [452, 132], [452, 308],
            [300, 395], [148, 308], [148, 132],
          ].map(([x, y], idx) => (
            <g key={`h-${idx}`}>
              <circle cx={x} cy={y} r="11" fill="url(#hydrogenGlow)" stroke="#64748b" strokeWidth="1" />
              <text x={x} y={y + 4} textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="bold" fontFamily="monospace">H</text>
            </g>
          ))}

          {/* Annotation Card */}
          {showLabels && (
            <g transform="translate(24, 24)">
              <rect width="190" height="64" rx="6" fill="#181715" stroke="rgba(240, 237, 230, 0.12)" />
              <text x="12" y="20" fill="#faf9f5" fontSize="12.5" fontWeight="600" fontFamily="'Newsreader', Georgia, serif">
                Benzene (C₆H₆) Resonance
              </text>
              <text x="12" y="38" fill="#b0aca2" fontSize="10.5" fontFamily="monospace">
                Planar sp² Hybridization (120°)
              </text>
              <text x="12" y="54" fill="#d97757" fontSize="10" fontFamily="monospace">
                6 Delocalized π-Electrons Ring
              </text>
            </g>
          )}
        </svg>
      );
    }

    // Default: Water Molecule Dipole (H2O)
    return (
      <svg viewBox="0 0 600 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Water Molecule (H2O) Dipole Structure">
        <defs>
          <radialGradient id="oxygenGlow" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#b91c1c" />
          </radialGradient>
          <radialGradient id="hydrogenOrb" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </radialGradient>
        </defs>

        {/* Covalent Bond Lines */}
        <line x1="300" y1="190" x2="190" y2="280" stroke="rgba(240, 237, 230, 0.4)" strokeWidth="6" strokeLinecap="round" />
        <line x1="300" y1="190" x2="410" y2="280" stroke="rgba(240, 237, 230, 0.4)" strokeWidth="6" strokeLinecap="round" />

        {/* Bond Angle Arc (104.5°) */}
        <path d="M 260 225 A 50 50 0 0 0 340 225" fill="none" stroke="#d97757" strokeWidth="2" strokeDasharray="3 3" />
        <text x="300" y="248" textAnchor="middle" fill="#d97757" fontSize="12" fontWeight="600" fontFamily="monospace">104.5°</text>

        {/* Central Oxygen Atom */}
        <circle cx="300" cy="190" r="44" fill="url(#oxygenGlow)" stroke="#7f1d1d" strokeWidth="2" />
        <text x="300" y="196" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="bold" fontFamily="monospace">O</text>
        <text x="300" y="132" textAnchor="middle" fill="#f87171" fontSize="14" fontWeight="bold" fontFamily="monospace">δ²⁻ (Partial Negative)</text>

        {/* Left Hydrogen Atom */}
        <circle cx="190" cy="280" r="28" fill="url(#hydrogenOrb)" stroke="#475569" strokeWidth="1.5" />
        <text x="190" y="286" textAnchor="middle" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace">H</text>
        <text x="160" y="328" textAnchor="middle" fill="#38bdf8" fontSize="13" fontWeight="bold" fontFamily="monospace">δ⁺</text>

        {/* Right Hydrogen Atom */}
        <circle cx="410" cy="280" r="28" fill="url(#hydrogenOrb)" stroke="#475569" strokeWidth="1.5" />
        <text x="410" y="286" textAnchor="middle" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace">H</text>
        <text x="440" y="328" textAnchor="middle" fill="#38bdf8" fontSize="13" fontWeight="bold" fontFamily="monospace">δ⁺</text>

        {/* Dipole Moment Arrow */}
        {showLabels && (
          <g transform="translate(300, 360)">
            <line x1="0" y1="0" x2="0" y2="-50" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="5 3" />
            <polygon points="0,-56 -5,-46 5,-46" fill="#fbbf24" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#fbbf24" strokeWidth="2" />
            <text x="14" y="-24" fill="#fbbf24" fontSize="11" fontFamily="monospace">Net Dipole Vector (μ = 1.85 D)</text>
          </g>
        )}

        {/* Annotation Box */}
        {showLabels && (
          <g transform="translate(24, 24)">
            <rect width="200" height="64" rx="6" fill="#181715" stroke="rgba(240, 237, 230, 0.12)" />
            <text x="12" y="22" fill="#faf9f5" fontSize="13" fontWeight="600" fontFamily="'Newsreader', Georgia, serif">
              Water Molecule (H₂O) Dipole
            </text>
            <text x="12" y="40" fill="#b0aca2" fontSize="10.5" fontFamily="monospace">
              Polar Covalent Single Bonds
            </text>
            <text x="12" y="56" fill="#d97757" fontSize="10" fontFamily="monospace">
              O-H Bond Length: 95.84 pm
            </text>
          </g>
        )}
      </svg>
    );
  };

  // Render Neural Network Architecture
  const renderNeuralNetSvg = () => {
    const layers = [
      { name: 'Input Layer', count: 3, label: 'x' },
      { name: 'Hidden Layer 1', count: 5, label: 'h¹' },
      { name: 'Hidden Layer 2', count: 4, label: 'h²' },
      { name: 'Output Layer', count: 2, label: 'ŷ' },
    ];
    const layerX = [80, 230, 380, 520];

    return (
      <svg viewBox="0 0 600 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Deep Neural Network Schematic">
        {/* Synaptic Inter-Layer Connection Lines */}
        {layers.slice(0, -1).map((l, lIdx) => {
          const nextLayer = layers[lIdx + 1];
          const x1 = layerX[lIdx];
          const x2 = layerX[lIdx + 1];

          return l.count > 0 && (
            <g key={`conn-${lIdx}`}>
              {Array.from({ length: l.count }).map((_, i) => {
                const y1 = 90 + (240 / (l.count + 1)) * (i + 1);
                return Array.from({ length: nextLayer.count }).map((_, j) => {
                  const y2 = 90 + (240 / (nextLayer.count + 1)) * (j + 1);
                  return (
                    <line
                      key={`syn-${i}-${j}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="rgba(217, 119, 87, 0.25)"
                      strokeWidth="1.2"
                    />
                  );
                });
              })}
            </g>
          );
        })}

        {/* Neurons */}
        {layers.map((l, lIdx) => {
          const x = layerX[lIdx];
          return (
            <g key={`layer-${lIdx}`}>
              {/* Layer Header Label */}
              {showLabels && (
                <text x={x} y="55" textAnchor="middle" fill="#b0aca2" fontSize="11" fontWeight="600" fontFamily="monospace">
                  {l.name}
                </text>
              )}

              {Array.from({ length: l.count }).map((_, i) => {
                const y = 90 + (240 / (l.count + 1)) * (i + 1);
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

        {/* Math Legend */}
        {showLabels && (
          <g transform="translate(140, 390)">
            <text fill="#b0aca2" fontSize="11" fontFamily="monospace">
              Forward Propagation: z = W·x + b | Activation: a = σ(z) = ReLU / Softmax
            </text>
          </g>
        )}
      </svg>
    );
  };

  // Render Raw/Custom SVG string provided by LLM
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
      {/* Top Header */}
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
                ? `Bohr Atomic Model: ${currentAtom.name} (Z=${currentAtom.z})`
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
              title={animate ? 'Pause orbital animation' : 'Start orbital animation'}
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
            title="Reset zoom"
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
          <button type="button" className="universal-diagram-btn" onClick={handleExportPng} title="Export 2x Retina PNG">
            📷 PNG
          </button>

          {/* Export SVG */}
          <button type="button" className="universal-diagram-btn" onClick={handleExportSvg} title="Export Lossless Vector SVG">
            📐 SVG
          </button>

          {/* Copy SVG code */}
          <button type="button" className="universal-diagram-btn" onClick={handleCopy} title="Copy SVG code">
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Interactive Element Preset Bar for Atoms */}
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

      {/* Preset Bar for Molecules */}
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

      {/* Viewport Canvas with Scalable Transform */}
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

      {/* Telemetry / Scientific Info Footer */}
      {normalizedType === 'atom' && (
        <div className="universal-diagram-footer">
          <div className="universal-diagram-metrics-row">
            <div className="universal-diagram-metric-item">
              <span className="universal-diagram-metric-label">Nucleus:</span>
              <span className="universal-diagram-metric-value">
                {currentAtom.z} p⁺ + {currentAtom.a - currentAtom.z} n⁰ (Mass A={currentAtom.a})
              </span>
            </div>
            <div className="universal-diagram-metric-item">
              <span className="universal-diagram-metric-label">Configuration:</span>
              <span className="universal-diagram-metric-value">{currentAtom.config}</span>
            </div>
            <div className="universal-diagram-metric-item">
              <span className="universal-diagram-metric-label">Shell Occupancy:</span>
              <span className="universal-diagram-metric-value">
                {currentAtom.shells.map((count, i) => `n=${i + 1}: ${count}e⁻`).join(' | ')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
