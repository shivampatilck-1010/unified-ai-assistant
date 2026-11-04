import React, { useState, useEffect, useRef, useCallback } from 'react';
import './InteractiveSimulationCard.css';

export interface InteractiveSimulationCardProps {
  type?: 'atomic-collision' | 'binary-tree' | 'sorting' | 'custom-html';
  title?: string;
  code?: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  color: string;
}

interface CollisionRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
}

interface TreeNode {
  val: number;
  left?: TreeNode | null;
  right?: TreeNode | null;
  x?: number;
  y?: number;
  highlighted?: boolean;
}

export const InteractiveSimulationCard: React.FC<InteractiveSimulationCardProps> = ({
  type = 'atomic-collision',
  title,
  code = '',
}) => {
  const [activeTab, setActiveTab] = useState<'sim' | 'code'>('sim');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // --- Atomic Collision State ---
  const [temperature, setTemperature] = useState<number>(1.2);
  const [atomCount, setAtomCount] = useState<number>(18);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [avgSpeed, setAvgSpeed] = useState<number>(2.1);
  const [totalEnergy, setTotalEnergy] = useState<number>(84);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<CollisionRing[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // --- Binary Tree Visualizer State ---
  const [treeInputVal, setTreeInputVal] = useState<string>('45');
  const [treeRoot, setTreeRoot] = useState<TreeNode | null>(null);
  const [searchTarget, setSearchTarget] = useState<number | null>(null);
  const [searchingPath, setSearchingPath] = useState<number[]>([]);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  // Determine actual simulation type
  const resolvedType = React.useMemo(() => {
    if (type) return type;
    if (code.includes('atomic') || code.includes('atom')) return 'atomic-collision';
    if (code.includes('BinarySearchTree') || code.includes('tree')) return 'binary-tree';
    if (code.includes('<canvas') || code.includes('<script')) return 'custom-html';
    return 'atomic-collision';
  }, [type, code]);

  const defaultTitle = React.useMemo(() => {
    if (title) return title;
    if (resolvedType === 'atomic-collision') return 'Atomic Collisions Simulation';
    if (resolvedType === 'binary-tree') return 'Binary Search Tree Visualizer';
    return 'Interactive Visual Simulation';
  }, [title, resolvedType]);

  // =========================================================================
  // ATOMIC COLLISION SIMULATOR ENGINE
  // =========================================================================
  const initParticles = useCallback((count: number, temp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    const particles: Particle[] = [];
    const heavyRatio = 0.35; // ~35% heavy purple atoms, 65% light green atoms

    for (let i = 0; i < count; i++) {
      const isHeavy = i < Math.ceil(count * heavyRatio);
      const radius = isHeavy ? 15 : 8.5;
      const mass = isHeavy ? 4.0 : 1.0;
      const color = isHeavy ? '#818cf8' : '#34d399'; // Purple vs Green

      // Position safely within boundary
      const x = radius + Math.random() * Math.max(10, width - radius * 2);
      const y = radius + Math.random() * Math.max(10, height - radius * 2);

      // Velocity based on Maxwell-Boltzmann-like thermal spread
      const angle = Math.random() * Math.PI * 2;
      const speed = (isHeavy ? 1.0 : 2.2) * temp * (0.8 + Math.random() * 0.4);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      particles.push({ id: i, x, y, vx, vy, radius, mass, color });
    }

    particlesRef.current = particles;
    ringsRef.current = [];
    setCollisionCount(0);
  }, []);

  // Set up & run canvas animation loop
  useEffect(() => {
    if (resolvedType !== 'atomic-collision' || activeTab !== 'sim') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    initParticles(atomCount, temperature);

    let lastTelemetryUpdate = performance.now();

    const loop = () => {
      const width = rect.width;
      const height = rect.height;

      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, width, height);

      // Subtle container grid background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let gx = 0; gx < width; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 0; gy < height; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      const particles = particlesRef.current;
      const rings = ringsRef.current;

      if (!isPaused) {
        // 1. Move and bounce off walls
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x - p.radius <= 0) {
            p.x = p.radius;
            p.vx = -p.vx;
          } else if (p.x + p.radius >= width) {
            p.x = width - p.radius;
            p.vx = -p.vx;
          }

          if (p.y - p.radius <= 0) {
            p.y = p.radius;
            p.vy = -p.vy;
          } else if (p.y + p.radius >= height) {
            p.y = height - p.radius;
            p.vy = -p.vy;
          }
        }

        // 2. Pairwise elastic collisions
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const minDist = p1.radius + p2.radius;

            if (dist < minDist && dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;

              // Relative velocity along collision normal
              const kx = p1.vx - p2.vx;
              const ky = p1.vy - p2.vy;
              const p = 2 * (nx * kx + ny * ky) / (p1.mass + p2.mass);

              if (p > 0) {
                p1.vx -= p * p2.mass * nx;
                p1.vy -= p * p2.mass * ny;
                p2.vx += p * p1.mass * nx;
                p2.vy += p * p1.mass * ny;

                // Spawn amber shockwave ring at collision point
                rings.push({
                  x: (p1.x + p2.x) / 2,
                  y: (p1.y + p2.y) / 2,
                  radius: minDist * 0.4,
                  maxRadius: minDist * 1.8,
                  opacity: 0.9,
                  color: '#fbbf24',
                });

                setCollisionCount((c) => c + 1);
              }

              // Position correction to prevent particle overlap
              const overlap = 0.5 * (minDist - dist);
              p1.x -= overlap * nx;
              p1.y -= overlap * ny;
              p2.x += overlap * nx;
              p2.y += overlap * ny;
            }
          }
        }
      }

      // 3. Render collision shockwave rings
      for (let rIdx = rings.length - 1; rIdx >= 0; rIdx--) {
        const ring = rings[rIdx];
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251, 191, 36, ${ring.opacity})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ring.radius += 1.2;
        ring.opacity -= 0.05;

        if (ring.opacity <= 0 || ring.radius >= ring.maxRadius) {
          rings.splice(rIdx, 1);
        }
      }

      // 4. Render particles with glowing halos
      for (const p of particles) {
        // Outer halo glow
        const gradient = ctx.createRadialGradient(p.x, p.y, p.radius * 0.2, p.x, p.y, p.radius * 1.5);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(0.8, p.color);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Solid atom core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 5. Periodic telemetry stats calculation (throttled to 100ms for smoothness)
      const now = performance.now();
      if (now - lastTelemetryUpdate > 100) {
        lastTelemetryUpdate = now;
        let speedSum = 0;
        let energySum = 0;

        for (const p of particles) {
          const spd = Math.hypot(p.vx, p.vy);
          speedSum += spd;
          energySum += 0.5 * p.mass * spd * spd;
        }

        const avg = particles.length > 0 ? speedSum / particles.length : 0;
        setAvgSpeed(parseFloat(avg.toFixed(1)));
        setTotalEnergy(Math.round(energySum));
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [resolvedType, activeTab, isPaused, atomCount, temperature, initParticles]);

  // Adjust temperature on the fly
  const handleTemperatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTemp = parseFloat(e.target.value);
    setTemperature(newTemp);
    const ratio = newTemp / (temperature || 1);
    for (const p of particlesRef.current) {
      p.vx *= ratio;
      p.vy *= ratio;
    }
  };

  // Adjust atom count
  const handleAtomCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(e.target.value, 10);
    setAtomCount(newCount);
    initParticles(newCount, temperature);
  };

  // =========================================================================
  // BINARY TREE VISUALIZER ENGINE
  // =========================================================================
  const insertTreeNode = (root: TreeNode | null, val: number): TreeNode => {
    if (!root) return { val, left: null, right: null };
    if (val < root.val) {
      return { ...root, left: insertTreeNode(root.left || null, val) };
    } else {
      return { ...root, right: insertTreeNode(root.right || null, val) };
    }
  };

  const initSampleTree = () => {
    let root: TreeNode | null = null;
    const initialVals = [50, 30, 70, 20, 40, 60, 80];
    for (const v of initialVals) {
      root = insertTreeNode(root, v);
    }
    setTreeRoot(root);
    setSearchingPath([]);
    setSearchStatus(null);
  };

  useEffect(() => {
    if (resolvedType === 'binary-tree' && !treeRoot) {
      initSampleTree();
    }
  }, [resolvedType, treeRoot]);

  const handleInsertNode = () => {
    const val = parseInt(treeInputVal.trim(), 10);
    if (isNaN(val)) return;
    setTreeRoot((prev) => insertTreeNode(prev, val));
    setTreeInputVal('');
    setSearchStatus(`Inserted node with key: ${val}`);
  };

  const handleSearchNode = () => {
    const val = parseInt(treeInputVal.trim(), 10);
    if (isNaN(val) || !treeRoot) return;

    const path: number[] = [];
    let curr: TreeNode | null = treeRoot;
    let found = false;

    while (curr) {
      path.push(curr.val);
      if (curr.val === val) {
        found = true;
        break;
      }
      if (val < curr.val) curr = curr.left || null;
      else curr = curr.right || null;
    }

    setSearchTarget(val);
    setSearchingPath(path);
    setSearchStatus(
      found
        ? `Found ${val}! Traversal path: ${path.join(' ➔ ')}`
        : `${val} not found in tree. Searched: ${path.join(' ➔ ')}`
    );
  };

  // Render SVG tree nodes recursively
  const renderTreeSvg = () => {
    if (!treeRoot) {
      return (
        <text x="250" y="150" fill="#64748b" textAnchor="middle" fontSize="14">
          Tree is empty. Insert nodes above.
        </text>
      );
    }

    const lines: React.ReactNode[] = [];
    const nodes: React.ReactNode[] = [];

    const traverse = (node: TreeNode, x: number, y: number, spread: number) => {
      const isHighlighted = searchingPath.includes(node.val);
      const isTarget = searchTarget === node.val && isHighlighted;

      if (node.left) {
        const lx = x - spread;
        const ly = y + 55;
        lines.push(
          <line
            key={`line-${node.val}-${node.left.val}`}
            x1={x}
            y1={y}
            x2={lx}
            y2={ly}
            stroke={isHighlighted && searchingPath.includes(node.left.val) ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}
            strokeWidth={isHighlighted && searchingPath.includes(node.left.val) ? '2.5' : '1.5'}
          />
        );
        traverse(node.left, lx, ly, spread * 0.55);
      }

      if (node.right) {
        const rx = x + spread;
        const ry = y + 55;
        lines.push(
          <line
            key={`line-${node.val}-${node.right.val}`}
            x1={x}
            y1={y}
            x2={rx}
            y2={ry}
            stroke={isHighlighted && searchingPath.includes(node.right.val) ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}
            strokeWidth={isHighlighted && searchingPath.includes(node.right.val) ? '2.5' : '1.5'}
          />
        );
        traverse(node.right, rx, ry, spread * 0.55);
      }

      nodes.push(
        <g key={`node-${node.val}`} className="tree-node-group">
          <circle
            cx={x}
            cy={y}
            r="18"
            fill={isTarget ? '#10b981' : isHighlighted ? '#3b82f6' : '#1e2230'}
            stroke={isTarget ? '#34d399' : isHighlighted ? '#60a5fa' : 'rgba(255, 255, 255, 0.3)'}
            strokeWidth={isHighlighted ? '2.5' : '1.5'}
          />
          <text
            x={x}
            y={y + 5}
            fill="#ffffff"
            textAnchor="middle"
            fontSize="12.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {node.val}
          </text>
        </g>
      );
    };

    traverse(treeRoot, 250, 40, 110);

    return (
      <svg width="100%" height="280" viewBox="0 0 500 280">
        {lines}
        {nodes}
      </svg>
    );
  };

  // =========================================================================
  // SANDBOXED CUSTOM HTML GENERATIVE UI
  // =========================================================================
  const renderCustomHtml = () => {
    // Injects dark theme CSS so generated HTML matches the app
    const styledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              padding: 12px;
              background: #050608;
              color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              overflow-x: hidden;
            }
            button {
              background: #1e2230;
              color: #f1f5f9;
              border: 1px solid rgba(255,255,255,0.15);
              padding: 6px 12px;
              border-radius: 6px;
              cursor: pointer;
            }
            button:hover { background: #2d3345; }
            input[type="range"] { accent-color: #818cf8; }
          </style>
        </head>
        <body>
          ${code}
        </body>
      </html>
    `;

    return (
      <iframe
        className="sim-iframe"
        title="Custom Interactive Visualizer"
        sandbox="allow-scripts allow-forms"
        srcDoc={styledHtml}
      />
    );
  };

  return (
    <div className={`sim-card ${isFullscreen ? 'sim-card--fullscreen' : ''}`}>
      {/* Header Bar */}
      <div className="sim-header">
        <div className="sim-header__left">
          <span className="sim-header__badge">
            <span className="sim-header__badge-dot" />
            {resolvedType === 'atomic-collision' ? 'Live Physics' : 'Interactive'}
          </span>
          <span className="sim-header__title">{defaultTitle}</span>
        </div>

        <div className="sim-header__right">
          <button
            type="button"
            className={`sim-tab-btn ${activeTab === 'sim' ? 'sim-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('sim')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Live Simulation
          </button>

          {code && (
            <button
              type="button"
              className={`sim-tab-btn ${activeTab === 'code' ? 'sim-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('code')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Code
            </button>
          )}

          <button
            type="button"
            className="sim-icon-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'sim' ? (
        <>
          {/* Controls Bar for Atomic Collisions */}
          {resolvedType === 'atomic-collision' && (
            <div className="sim-controls-bar">
              <div className="sim-slider-group">
                <label>Temperature</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="0.4"
                  max="3.0"
                  step="0.1"
                  value={temperature}
                  onChange={handleTemperatureChange}
                />
                <span className="sim-slider-val">{temperature.toFixed(1)}x</span>
              </div>

              <div className="sim-slider-group">
                <label>Atoms</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="6"
                  max="36"
                  step="2"
                  value={atomCount}
                  onChange={handleAtomCountChange}
                />
                <span className="sim-slider-val">{atomCount}</span>
              </div>

              <div className="sim-legend">
                <span className="sim-legend__item">
                  <span className="sim-legend__dot sim-legend__dot--heavy" /> Heavy (4m)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot sim-legend__dot--light" /> Light (1m)
                </span>
              </div>
            </div>
          )}

          {/* Controls Bar for Binary Tree */}
          {resolvedType === 'binary-tree' && (
            <div className="tree-controls-bar">
              <input
                type="number"
                className="tree-input"
                placeholder="Value..."
                value={treeInputVal}
                onChange={(e) => setTreeInputVal(e.target.value)}
              />
              <button type="button" className="sim-btn sim-btn--primary" onClick={handleInsertNode}>
                + Insert Node
              </button>
              <button type="button" className="sim-btn" onClick={handleSearchNode}>
                🔍 Search
              </button>
              <button type="button" className="sim-btn" onClick={initSampleTree}>
                🔄 Reset Sample
              </button>
              {searchStatus && (
                <span style={{ fontSize: '11.5px', color: '#38bdf8', marginLeft: 'auto' }}>
                  {searchStatus}
                </span>
              )}
            </div>
          )}

          {/* Interactive Simulation Viewport */}
          <div className="sim-viewport">
            {resolvedType === 'atomic-collision' && <canvas ref={canvasRef} className="sim-canvas" />}
            {resolvedType === 'binary-tree' && renderTreeSvg()}
            {resolvedType === 'custom-html' && renderCustomHtml()}
          </div>

          {/* Bottom Telemetry Bar */}
          {resolvedType === 'atomic-collision' && (
            <div className="sim-telemetry">
              <div className="sim-stats">
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Collisions</span>
                  <span className="sim-stat-value">{collisionCount}</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Avg speed</span>
                  <span className="sim-stat-value">{avgSpeed}</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Total energy</span>
                  <span className="sim-stat-value">{totalEnergy}</span>
                </div>
              </div>

              <div className="sim-actions">
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => initParticles(atomCount, temperature)}
                >
                  🔄 Reset
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  What happens at the atomic level ↗
                </button>
              </div>
            </div>
          )}

          {/* Atomic Principles Deep Dive Drawer */}
          {showDetails && resolvedType === 'atomic-collision' && (
            <div className="sim-details-drawer">
              <div className="sim-details-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Physical Principles of Atomic Collisions:
              </div>
              <div className="sim-details-content">
                <p>
                  • <strong>Elastic Collisions:</strong> In ideal gases, atoms conserve both total kinetic energy (
                  <em>E = &frac12; mv&sup2;</em>) and linear momentum (<em>p = mv</em>) during collisions.
                </p>
                <p>
                  • <strong>Mass Disparity:</strong> When heavy purple atoms (4&times; mass) strike light green atoms (1&times; mass), the lighter atoms rebound with significantly greater velocity, transferring kinetic energy outward.
                </p>
                <p>
                  • <strong>Temperature & Maxwell-Boltzmann:</strong> Increasing temperature directly scales the mean kinetic energy of the particles, raising collision frequency and container pressure (<em>PV = N k_B T</em>).
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="sim-code-view">
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '12.5px', color: '#e2e8f0' }}>
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
