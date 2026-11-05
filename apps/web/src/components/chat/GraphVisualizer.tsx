import React, { useState, useRef, useCallback } from 'react';
import type { HoveredInfo } from './InteractiveSimulationCard';
import { loadSimulationState, saveSimulationState } from './simulationPersistence';

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  dist: number;
  visited: boolean;
  inPath: boolean;
  parentId: string | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  highlighted: boolean;
  inPath: boolean;
}

interface GraphVisualizerProps {
  onHover?: (info: HoveredInfo | null) => void;
  onStateChange?: () => void;
}

const DEFAULT_NODES: GraphNode[] = [
  { id: 'A', label: 'A', x: 70, y: 140, dist: 0, visited: false, inPath: false, parentId: null },
  { id: 'B', label: 'B', x: 190, y: 65, dist: Infinity, visited: false, inPath: false, parentId: null },
  { id: 'C', label: 'C', x: 190, y: 215, dist: Infinity, visited: false, inPath: false, parentId: null },
  { id: 'D', label: 'D', x: 330, y: 70, dist: Infinity, visited: false, inPath: false, parentId: null },
  { id: 'E', label: 'E', x: 330, y: 210, dist: Infinity, visited: false, inPath: false, parentId: null },
  { id: 'F', label: 'F', x: 460, y: 140, dist: Infinity, visited: false, inPath: false, parentId: null },
];

const DEFAULT_EDGES: GraphEdge[] = [
  { from: 'A', to: 'B', weight: 4, highlighted: false, inPath: false },
  { from: 'A', to: 'C', weight: 2, highlighted: false, inPath: false },
  { from: 'B', to: 'D', weight: 5, highlighted: false, inPath: false },
  { from: 'B', to: 'C', weight: 1, highlighted: false, inPath: false },
  { from: 'C', to: 'E', weight: 8, highlighted: false, inPath: false },
  { from: 'C', to: 'D', weight: 10, highlighted: false, inPath: false },
  { from: 'D', to: 'E', weight: 2, highlighted: false, inPath: false },
  { from: 'D', to: 'F', weight: 2, highlighted: false, inPath: false },
  { from: 'E', to: 'F', weight: 3, highlighted: false, inPath: false },
];

export const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ onHover, onStateChange }) => {
  const [nodes, setNodes] = useState<GraphNode[]>(() =>
    loadSimulationState('graph_nodes', DEFAULT_NODES)
  );
  const [edges, setEdges] = useState<GraphEdge[]>(() =>
    loadSimulationState('graph_edges', DEFAULT_EDGES)
  );

  const [algorithm, setAlgorithm] = useState<'dijkstra' | 'astar' | 'bfs' | 'dfs'>('dijkstra');
  const [startNodeId, setStartNodeId] = useState<string>('A');
  const [targetNodeId, setTargetNodeId] = useState<string>('F');
  const [stepMessage, setStepMessage] = useState<string>('Ready to run traversal or shortest path.');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [pqView, setPqView] = useState<Array<{ id: string; val: number }>>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [_isCompleted, setIsCompleted] = useState<boolean>(false);

  // Dragging interaction state (Mouse & Touch)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Sync to persistence
  const syncPersistence = useCallback(
    (currentNodes: GraphNode[], currentEdges: GraphEdge[]) => {
      saveSimulationState('graph_nodes', currentNodes);
      saveSimulationState('graph_edges', currentEdges);
      onStateChange?.();
    },
    [onStateChange]
  );

  const handleResetGraph = useCallback(() => {
    setIsRunning(false);
    setIsCompleted(false);
    setActiveNodeId(null);
    setPqView([]);
    setStepMessage('Graph reset to initial topology. Select an algorithm and start.');
    const freshNodes = DEFAULT_NODES.map((n) => ({
      ...n,
      dist: n.id === startNodeId ? 0 : Infinity,
      visited: false,
      inPath: false,
      parentId: null,
    }));
    const freshEdges = DEFAULT_EDGES.map((e) => ({ ...e, highlighted: false, inPath: false }));
    setNodes(freshNodes);
    setEdges(freshEdges);
    syncPersistence(freshNodes, freshEdges);
  }, [startNodeId, syncPersistence]);

  // Clean algorithm state without moving node positions
  const clearAlgoState = useCallback(() => {
    setIsRunning(false);
    setIsCompleted(false);
    setActiveNodeId(null);
    setPqView([]);
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        dist: n.id === startNodeId ? 0 : Infinity,
        visited: false,
        inPath: false,
        parentId: null,
      }))
    );
    setEdges((prev) => prev.map((e) => ({ ...e, highlighted: false, inPath: false })));
  }, [startNodeId]);

  // Touch and Mouse Coordinate conversion helper
  const getSvgCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 540 / rect.width;
    const scaleY = 280 / rect.height;
    const x = Math.max(25, Math.min(515, (clientX - rect.left) * scaleX));
    const y = Math.max(25, Math.min(255, (clientY - rect.top) * scaleY));
    return { x, y };
  };

  // Drag handlers
  const handlePointerDown = (nodeId: string) => {
    setDraggingNodeId(nodeId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId) return;
    const coords = getSvgCoordinates(e.clientX, e.clientY);
    if (!coords) return;
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === draggingNodeId ? { ...n, x: coords.x, y: coords.y } : n));
      syncPersistence(next, edges);
      return next;
    });
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!draggingNodeId || e.touches.length === 0) return;
    const touch = e.touches[0];
    const coords = getSvgCoordinates(touch.clientX, touch.clientY);
    if (!coords) return;
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === draggingNodeId ? { ...n, x: coords.x, y: coords.y } : n));
      syncPersistence(next, edges);
      return next;
    });
  };

  const handlePointerUp = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
  };

  // Euclidean Heuristic for A* Search
  const getHeuristic = useCallback(
    (nodeId: string): number => {
      const node = nodes.find((n) => n.id === nodeId);
      const target = nodes.find((n) => n.id === targetNodeId);
      if (!node || !target) return 0;
      const dx = target.x - node.x;
      const dy = target.y - node.y;
      // Scaled by 0.05 to approximate edge costs
      return Math.round(Math.sqrt(dx * dx + dy * dy) * 0.035);
    },
    [nodes, targetNodeId]
  );

  // Run full algorithm automated animation
  const runAlgorithm = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setIsCompleted(false);

    // Initial reset
    const curNodes: Record<string, GraphNode> = {};
    nodes.forEach((n) => {
      curNodes[n.id] = {
        ...n,
        dist: n.id === startNodeId ? 0 : Infinity,
        visited: false,
        inPath: false,
        parentId: null,
      };
    });
    setNodes(Object.values(curNodes));
    setEdges((prev) => prev.map((e) => ({ ...e, highlighted: false, inPath: false })));

    setStepMessage(`Starting ${algorithm.toUpperCase()} from Node [${startNodeId}] towards [${targetNodeId}]...`);
    await new Promise((r) => setTimeout(r, 450));

    // Dijkstra / A*
    if (algorithm === 'dijkstra' || algorithm === 'astar') {
      const unvisited = new Set<string>(Object.keys(curNodes));
      const pq: Array<{ id: string; priority: number }> = [
        { id: startNodeId, priority: algorithm === 'astar' ? getHeuristic(startNodeId) : 0 },
      ];

      while (pq.length > 0) {
        pq.sort((a, b) => a.priority - b.priority);
        const currentItem = pq.shift()!;
        const currentId = currentItem.id;

        if (!unvisited.has(currentId)) continue;
        unvisited.delete(currentId);

        curNodes[currentId].visited = true;
        setActiveNodeId(currentId);
        setNodes(Object.values(curNodes));
        setPqView(pq.map((p) => ({ id: p.id, val: p.priority })));

        setStepMessage(
          `Extract-Min: Visited Node [${currentId}] with tentative cost ${curNodes[currentId].dist}. Inspecting incident edges.`
        );
        await new Promise((r) => setTimeout(r, 600));

        if (currentId === targetNodeId) {
          setStepMessage(`🎯 Target Node [${targetNodeId}] reached! Reconstructing optimal shortest path.`);
          break;
        }

        // Relax neighbors
        const neighborEdges = edges.filter((e) => e.from === currentId || e.to === currentId);
        for (const edge of neighborEdges) {
          const neighborId = edge.from === currentId ? edge.to : edge.from;
          if (!unvisited.has(neighborId)) continue;

          // Highlight current edge
          setEdges((prev) =>
            prev.map((e) =>
              (e.from === currentId && e.to === neighborId) || (e.from === neighborId && e.to === currentId)
                ? { ...e, highlighted: true }
                : e
            )
          );

          const altDist = curNodes[currentId].dist + edge.weight;
          if (altDist < curNodes[neighborId].dist) {
            curNodes[neighborId].dist = altDist;
            curNodes[neighborId].parentId = currentId;

            const priority = algorithm === 'astar' ? altDist + getHeuristic(neighborId) : altDist;
            pq.push({ id: neighborId, priority });
            setPqView(pq.map((p) => ({ id: p.id, val: p.priority })));

            setStepMessage(
              `Edge Relaxation (${currentId} -> ${neighborId}): New shorter path found (${altDist} < previous). Updated parent pointer.`
            );
            setNodes(Object.values(curNodes));
            await new Promise((r) => setTimeout(r, 550));
          }
        }
      }
    } else if (algorithm === 'bfs') {
      // Breadth First Search (Queue)
      const queue: string[] = [startNodeId];
      const visitedSet = new Set<string>([startNodeId]);
      curNodes[startNodeId].dist = 0;

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        curNodes[currentId].visited = true;
        setActiveNodeId(currentId);
        setNodes(Object.values(curNodes));
        setPqView(queue.map((id) => ({ id, val: curNodes[id].dist })));

        setStepMessage(`BFS Queue Dequeue: Exploring Node [${currentId}].`);
        await new Promise((r) => setTimeout(r, 600));

        if (currentId === targetNodeId) break;

        const neighborEdges = edges.filter((e) => e.from === currentId || e.to === currentId);
        for (const edge of neighborEdges) {
          const neighborId = edge.from === currentId ? edge.to : edge.from;
          if (!visitedSet.has(neighborId)) {
            visitedSet.add(neighborId);
            curNodes[neighborId].dist = curNodes[currentId].dist + 1;
            curNodes[neighborId].parentId = currentId;
            queue.push(neighborId);
            setPqView(queue.map((id) => ({ id, val: curNodes[id].dist })));
            setNodes(Object.values(curNodes));
            await new Promise((r) => setTimeout(r, 450));
          }
        }
      }
    } else if (algorithm === 'dfs') {
      // Depth First Search (Stack)
      const stack: string[] = [startNodeId];
      const visitedSet = new Set<string>();

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (visitedSet.has(currentId)) continue;
        visitedSet.add(currentId);

        curNodes[currentId].visited = true;
        setActiveNodeId(currentId);
        setNodes(Object.values(curNodes));
        setPqView(stack.map((id) => ({ id, val: 0 })));

        setStepMessage(`DFS Stack Pop: Diving deep into Node [${currentId}].`);
        await new Promise((r) => setTimeout(r, 600));

        if (currentId === targetNodeId) break;

        const neighborEdges = edges.filter((e) => e.from === currentId || e.to === currentId);
        for (const edge of neighborEdges) {
          const neighborId = edge.from === currentId ? edge.to : edge.from;
          if (!visitedSet.has(neighborId)) {
            curNodes[neighborId].parentId = currentId;
            stack.push(neighborId);
            setPqView(stack.map((id) => ({ id, val: 0 })));
          }
        }
      }
    }

    // Reconstruct Shortest / Traversed Path
    let curr: string | null = targetNodeId;
    const pathNodeIds: string[] = [];
    while (curr) {
      pathNodeIds.unshift(curr);
      curNodes[curr].inPath = true;
      curr = curNodes[curr].parentId;
      if (curr === startNodeId) {
        pathNodeIds.unshift(startNodeId);
        curNodes[startNodeId].inPath = true;
        break;
      }
    }

    // Highlight edges in path
    setEdges((prev) =>
      prev.map((e) => {
        let inPath = false;
        for (let i = 0; i < pathNodeIds.length - 1; i++) {
          if (
            (e.from === pathNodeIds[i] && e.to === pathNodeIds[i + 1]) ||
            (e.to === pathNodeIds[i] && e.from === pathNodeIds[i + 1])
          ) {
            inPath = true;
            break;
          }
        }
        return { ...e, inPath, highlighted: inPath };
      })
    );

    setActiveNodeId(null);
    setNodes(Object.values(curNodes));
    setIsRunning(false);
    setIsCompleted(true);
    setStepMessage(
      `✅ Optimal Path Reconstructed: [${pathNodeIds.join(' ➔ ')}] • Total Cost: ${
        curNodes[targetNodeId]?.dist !== Infinity ? curNodes[targetNodeId]?.dist : 'Unreachable'
      }`
    );
  };

  return (
    <div className="graph-visualizer-container" style={{ width: '100%', userSelect: 'none' }}>
      {/* Algorithm & Control Toolbar */}
      <div className="tree-controls-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', padding: '2px', borderRadius: '6px' }}>
          {(['dijkstra', 'astar', 'bfs', 'dfs'] as const).map((algo) => (
            <button
              key={algo}
              type="button"
              className={`sim-btn ${algorithm === algo ? 'sim-btn--primary' : ''}`}
              style={{ fontSize: '11px', padding: '4px 10px', textTransform: 'capitalize' }}
              disabled={isRunning}
              onClick={() => {
                setAlgorithm(algo);
                clearAlgoState();
              }}
            >
              {algo === 'astar' ? 'A* Search' : algo.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
          <span>Start:</span>
          <select
            className="chat-view__model-select"
            style={{ width: '50px', padding: '2px 4px', fontSize: '11px' }}
            value={startNodeId}
            disabled={isRunning}
            onChange={(e) => {
              setStartNodeId(e.target.value);
              clearAlgoState();
            }}
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>

          <span>Target:</span>
          <select
            className="chat-view__model-select"
            style={{ width: '50px', padding: '2px 4px', fontSize: '11px' }}
            value={targetNodeId}
            disabled={isRunning}
            onChange={(e) => {
              setTargetNodeId(e.target.value);
              clearAlgoState();
            }}
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="sim-btn sim-btn--primary"
          onClick={runAlgorithm}
          disabled={isRunning}
          title="Execute automated graph traversal"
        >
          {isRunning ? '⏳ Running...' : `▶ Run ${algorithm === 'astar' ? 'A*' : algorithm.toUpperCase()}`}
        </button>

        <button
          type="button"
          className="sim-btn"
          onClick={handleResetGraph}
          disabled={isRunning}
          title="Reset graph positions and edge costs"
        >
          ↺ Reset Graph
        </button>

        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          💡 Drag nodes to adjust topology
        </span>
      </div>

      {/* Status & Priority Queue Telemetry Bar */}
      <div
        style={{
          background: 'rgba(36, 34, 32, 0.85)',
          borderLeft: '3px solid #d97757',
          padding: '6px 12px',
          fontSize: '11.5px',
          color: '#ede8df',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'monospace',
        }}
      >
        <span>{stepMessage}</span>
        {pqView.length > 0 && (
          <span style={{ color: '#e08365', fontSize: '10.5px' }}>
            {algorithm === 'bfs' ? 'Queue' : algorithm === 'dfs' ? 'Stack' : 'PQ'}: [
            {pqView.map((item) => `${item.id}:${item.val}`).join(', ')}]
          </span>
        )}
      </div>

      {/* Interactive SVG Canvas */}
      <svg
        ref={svgRef}
        width="100%"
        height="280"
        viewBox="0 0 540 280"
        style={{
          background: '#141312',
          touchAction: 'none',
          cursor: draggingNodeId ? 'grabbing' : 'default',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handlePointerUp}
      >
        <defs>
          <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((edge, idx) => {
          const fromNode = nodes.find((n) => n.id === edge.from);
          const toNode = nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const midX = (fromNode.x + toNode.x) / 2;
          const midY = (fromNode.y + toNode.y) / 2;

          const isPathEdge = edge.inPath;
          const isHighlighted = edge.highlighted;

          return (
            <g key={`edge-${idx}`}>
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={isPathEdge ? '#c084fc' : isHighlighted ? '#fbbf24' : 'rgba(255,255,255,0.18)'}
                strokeWidth={isPathEdge ? 4 : isHighlighted ? 2.5 : 1.5}
                filter={isPathEdge ? 'url(#glow-purple)' : undefined}
                strokeLinecap="round"
              />
              {/* Edge Weight Pill */}
              <rect
                x={midX - 11}
                y={midY - 9}
                width={22}
                height={18}
                rx={4}
                fill="#0f172a"
                stroke={isPathEdge ? '#c084fc' : 'rgba(255,255,255,0.2)'}
                strokeWidth={1}
              />
              <text
                x={midX}
                y={midY + 4}
                fill={isPathEdge ? '#f3e8ff' : '#94a3b8'}
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {edge.weight}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isStart = node.id === startNodeId;
          const isTarget = node.id === targetNodeId;
          const isActive = node.id === activeNodeId;
          const isPath = node.inPath;
          const isVisited = node.visited;

          let strokeColor = '#d97757';
          let fillColor = '#1e1c1a';

          if (isPath) {
            strokeColor = '#e08365';
            fillColor = '#38221b';
          } else if (isActive) {
            strokeColor = '#f59e0b';
            fillColor = '#451a03';
          } else if (isVisited) {
            strokeColor = '#34d399';
            fillColor = '#064e3b';
          } else if (isStart) {
            strokeColor = '#d97757';
          }

          return (
            <g
              key={node.id}
              className="tree-node-group"
              style={{ cursor: 'grab', touchAction: 'none' }}
              onPointerDown={() => handlePointerDown(node.id)}
              onMouseEnter={(e) => {
                if (!onHover) return;
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                onHover({
                  x: rect ? e.clientX - rect.left : node.x,
                  y: rect ? e.clientY - rect.top : node.y,
                  title: `Graph Vertex [${node.label}]`,
                  category: isStart ? 'Start Node' : isTarget ? 'Target Node' : 'Graph Node',
                  color: strokeColor,
                  description: `Vertex ${node.label} in weighted graph. Tentative distance d = ${
                    node.dist === Infinity ? '∞' : node.dist
                  }. Parent: ${node.parentId || 'None'}.`,
                  stats: [
                    { label: 'Label', value: node.label },
                    { label: 'Distance', value: String(node.dist === Infinity ? '∞' : node.dist) },
                    { label: 'Heuristic h(n)', value: String(getHeuristic(node.id)) },
                    { label: 'Visited', value: node.visited ? 'Yes' : 'No' },
                    { label: 'Optimal Path', value: node.inPath ? 'Active' : 'False' },
                  ],
                });
              }}
              onMouseLeave={() => onHover && onHover(null)}
            >
              {/* Outer boundary halo */}
              <circle
                cx={node.x}
                cy={node.y}
                r={21}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isPath || isActive ? 3 : 2}
                filter={isPath ? 'url(#glow-purple)' : isActive ? 'url(#glow-cyan)' : undefined}
              />

              {/* Node Label */}
              <text
                x={node.x}
                y={node.y + 4.5}
                fill="#ffffff"
                fontSize="13"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="sans-serif"
                pointerEvents="none"
              >
                {node.label}
              </text>

              {/* Distance Subtext Badge */}
              <rect
                x={node.x - 14}
                y={node.y + 24}
                width={28}
                height={14}
                rx={3}
                fill="#020617"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={0.8}
              />
              <text
                x={node.x}
                y={node.y + 34}
                fill={node.dist === Infinity ? '#8c877d' : '#e08365'}
                fontSize="9"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
                pointerEvents="none"
              >
                {node.dist === Infinity ? '∞' : `d:${node.dist}`}
              </text>

              {/* Start / Target Badges */}
              {isStart && (
                <text x={node.x} y={node.y - 25} fill="#e08365" fontSize="9" fontWeight="bold" textAnchor="middle">
                  START
                </text>
              )}
              {isTarget && (
                <text x={node.x} y={node.y - 25} fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">
                  GOAL
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
