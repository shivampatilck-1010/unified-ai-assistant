import React, { useState, useCallback } from 'react';
import type { HoveredInfo } from './InteractiveSimulationCard';
import { loadSimulationState, saveSimulationState } from './simulationPersistence';

export interface MemoryItem {
  id: string;
  val: number | string;
  addr: string;
  highlighted?: boolean;
}

interface StackQueueVisualizerProps {
  onHover?: (info: HoveredInfo | null) => void;
  onStateChange?: () => void;
}

const MAX_CAPACITY = 7;

const DEFAULT_STACK: MemoryItem[] = [
  { id: 's-1', val: 10, addr: '0x7FFF10' },
  { id: 's-2', val: 25, addr: '0x7FFF18' },
  { id: 's-3', val: 42, addr: '0x7FFF20' },
];

const DEFAULT_QUEUE: MemoryItem[] = [
  { id: 'q-1', val: 'req_1', addr: '0x10A0' },
  { id: 'q-2', val: 'req_2', addr: '0x10B8' },
  { id: 'q-3', val: 'req_3', addr: '0x10D0' },
  { id: 'q-4', val: 'req_4', addr: '0x10E8' },
];

export const StackQueueVisualizer: React.FC<StackQueueVisualizerProps> = ({ onHover, onStateChange }) => {
  const [mode, setMode] = useState<'stack' | 'queue'>('stack');
  const [stackItems, setStackItems] = useState<MemoryItem[]>(() =>
    loadSimulationState('memory_stack_items', DEFAULT_STACK)
  );
  const [queueItems, setQueueItems] = useState<MemoryItem[]>(() =>
    loadSimulationState('memory_queue_items', DEFAULT_QUEUE)
  );

  const [inputVal, setInputVal] = useState<string>('99');
  const [statusMsg, setStatusMsg] = useState<string>(
    'LIFO Call Stack & FIFO Buffer visualizer ready. Push, Pop, Enqueue, or Dequeue.'
  );

  const syncPersistence = useCallback(
    (currentStack: MemoryItem[], currentQueue: MemoryItem[]) => {
      saveSimulationState('memory_stack_items', currentStack);
      saveSimulationState('memory_queue_items', currentQueue);
      onStateChange?.();
    },
    [onStateChange]
  );

  // --- Stack Operations (LIFO) ---
  const handlePush = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (stackItems.length >= MAX_CAPACITY) {
      setStatusMsg('⚠️ Stack Overflow! Max capacity reached (7 frames). Cannot push further.');
      return;
    }

    const hexAddr = `0x7FFF${(0x28 + stackItems.length * 8).toString(16).toUpperCase()}`;
    const newItem: MemoryItem = {
      id: `s-${Date.now()}`,
      val: isNaN(Number(val)) ? val : Number(val),
      addr: hexAddr,
      highlighted: true,
    };

    const next = [...stackItems, newItem];
    setStackItems(next);
    syncPersistence(next, queueItems);
    setStatusMsg(`PUSH: Pushed [${val}] onto Top of Stack at address ${hexAddr} (O(1)).`);

    setTimeout(() => {
      setStackItems((prev) => prev.map((item) => ({ ...item, highlighted: false })));
    }, 800);
  };

  const handlePop = () => {
    if (stackItems.length === 0) {
      setStatusMsg('⚠️ Stack Underflow! Stack is completely empty. Cannot pop.');
      return;
    }

    const popped = stackItems[stackItems.length - 1];
    const next = stackItems.slice(0, -1);
    setStackItems(next);
    syncPersistence(next, queueItems);
    setStatusMsg(`POP: Popped Top element [${popped.val}] from address ${popped.addr} (O(1)).`);
  };

  const handlePeek = () => {
    if (stackItems.length === 0) {
      setStatusMsg('Stack is empty. Nothing to peek.');
      return;
    }
    const top = stackItems[stackItems.length - 1];
    setStackItems((prev) =>
      prev.map((item, idx) => ({ ...item, highlighted: idx === prev.length - 1 }))
    );
    setStatusMsg(`PEEK: Top element is [${top.val}] located at ${top.addr}.`);
    setTimeout(() => {
      setStackItems((prev) => prev.map((item) => ({ ...item, highlighted: false })));
    }, 1200);
  };

  // --- Queue Operations (FIFO) ---
  const handleEnqueue = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (queueItems.length >= MAX_CAPACITY) {
      setStatusMsg('⚠️ Queue Full! Buffer capacity reached (7 elements). Cannot enqueue.');
      return;
    }

    const hexAddr = `0x10${(0xa0 + queueItems.length * 0x18).toString(16).toUpperCase()}`;
    const newItem: MemoryItem = {
      id: `q-${Date.now()}`,
      val: isNaN(Number(val)) ? val : Number(val),
      addr: hexAddr,
      highlighted: true,
    };

    const next = [...queueItems, newItem];
    setQueueItems(next);
    syncPersistence(stackItems, next);
    setStatusMsg(`ENQUEUE: Appended [${val}] at TAIL (index ${queueItems.length}) at ${hexAddr} (O(1)).`);

    setTimeout(() => {
      setQueueItems((prev) => prev.map((item) => ({ ...item, highlighted: false })));
    }, 800);
  };

  const handleDequeue = () => {
    if (queueItems.length === 0) {
      setStatusMsg('⚠️ Queue Empty! Cannot dequeue from empty FIFO buffer.');
      return;
    }

    const dequeued = queueItems[0];
    const next = queueItems.slice(1);
    setQueueItems(next);
    syncPersistence(stackItems, next);
    setStatusMsg(`DEQUEUE: Serviced HEAD element [${dequeued.val}] from ${dequeued.addr} (O(1) FIFO).`);
  };

  const handleReset = () => {
    setStackItems(DEFAULT_STACK);
    setQueueItems(DEFAULT_QUEUE);
    syncPersistence(DEFAULT_STACK, DEFAULT_QUEUE);
    setStatusMsg('Reset Stack & Queue memory states to default.');
  };

  return (
    <div className="stack-queue-visualizer" style={{ width: '100%', userSelect: 'none' }}>
      {/* Controls Bar */}
      <div className="tree-controls-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            className={`sim-btn ${mode === 'stack' ? 'sim-btn--primary' : ''}`}
            style={{ fontSize: '11px', padding: '4px 10px' }}
            onClick={() => setMode('stack')}
          >
            Stack (LIFO)
          </button>
          <button
            type="button"
            className={`sim-btn ${mode === 'queue' ? 'sim-btn--primary' : ''}`}
            style={{ fontSize: '11px', padding: '4px 10px' }}
            onClick={() => setMode('queue')}
          >
            Queue (FIFO)
          </button>
        </div>

        <input
          type="text"
          className="tree-input"
          style={{ width: '70px' }}
          placeholder="Value..."
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
        />

        {mode === 'stack' ? (
          <>
            <button type="button" className="sim-btn sim-btn--primary" onClick={handlePush}>
              + Push
            </button>
            <button type="button" className="sim-btn" onClick={handlePop}>
              - Pop
            </button>
            <button type="button" className="sim-btn" onClick={handlePeek}>
              Peek
            </button>
          </>
        ) : (
          <>
            <button type="button" className="sim-btn sim-btn--primary" onClick={handleEnqueue}>
              + Enqueue Tail
            </button>
            <button type="button" className="sim-btn" onClick={handleDequeue}>
              - Dequeue Head
            </button>
          </>
        )}

        <button type="button" className="sim-btn" onClick={handleReset}>
          ↺ Reset
        </button>

        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
          Size: <strong style={{ color: '#38bdf8' }}>{mode === 'stack' ? stackItems.length : queueItems.length}</strong> / {MAX_CAPACITY}
        </span>
      </div>

      {/* Telemetry Status Banner */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          borderLeft: '3px solid #38bdf8',
          padding: '6px 12px',
          fontSize: '11.5px',
          color: '#cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'monospace',
        }}
      >
        <span>{statusMsg}</span>
        <span style={{ color: '#fbbf24', fontSize: '10.5px' }}>
          {mode === 'stack' ? 'Discipline: LIFO (Last In First Out)' : 'Discipline: FIFO (First In First Out)'}
        </span>
      </div>

      {/* SVG Memory Canvas */}
      <svg width="100%" height="280" viewBox="0 0 540 280" style={{ background: '#070709' }}>
        <defs>
          <marker id="arrow-sq" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
        </defs>

        {mode === 'stack' ? (
          // ================= STACK VIEW (Vertical LIFO) =================
          <g transform="translate(60, 20)">
            {/* Stack Boundaries & Base */}
            <line x1={80} y1={10} x2={80} y2={230} stroke="rgba(255,255,255,0.25)" strokeWidth={2} />
            <line x1={320} y1={10} x2={320} y2={230} stroke="rgba(255,255,255,0.25)" strokeWidth={2} />
            <line x1={70} y1={230} x2={330} y2={230} stroke="#38bdf8" strokeWidth={4} strokeLinecap="round" />
            <text x={200} y={248} fill="#64748b" fontSize="10.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
              STACK BOTTOM (0x7FFF00)
            </text>

            {/* Stack Frames */}
            {stackItems.map((item, idx) => {
              const itemHeight = 28;
              const y = 200 - idx * (itemHeight + 4);
              const isTop = idx === stackItems.length - 1;
              const isHighlighted = item.highlighted;

              return (
                <g
                  key={item.id}
                  className="tree-node-group"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    if (!onHover) return;
                    const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                    onHover({
                      x: rect ? e.clientX - rect.left : 200,
                      y: rect ? e.clientY - rect.top : y,
                      title: `Stack Frame [${item.val}] (Index ${idx})`,
                      category: isTop ? 'Top of Stack' : 'Stack Activation Frame',
                      color: isHighlighted ? '#fbbf24' : '#38bdf8',
                      description: `LIFO Stack element. Stored in memory at address ${item.addr}. Next pop operation will return this frame if at TOP.`,
                      stats: [
                        { label: 'Value', value: String(item.val) },
                        { label: 'Index', value: String(idx) },
                        { label: 'Address', value: item.addr },
                        { label: 'Push/Pop Complexity', value: 'O(1)' },
                      ],
                    });
                  }}
                  onMouseLeave={() => onHover && onHover(null)}
                >
                  <rect
                    x={88}
                    y={y}
                    width={224}
                    height={itemHeight}
                    rx={5}
                    fill={isHighlighted ? '#1e293b' : isTop ? '#0c4a6e' : '#0f172a'}
                    stroke={isHighlighted ? '#fbbf24' : isTop ? '#38bdf8' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={isHighlighted || isTop ? 2 : 1}
                  />
                  <text
                    x={200}
                    y={y + 18}
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    Val: {item.val}  ({item.addr})
                  </text>

                  {/* Top Pointer Badge */}
                  {isTop && (
                    <g>
                      <rect x={335} y={y + 4} width={58} height={20} rx={4} fill="#0284c7" />
                      <text x={364} y={y + 18} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        TOP ➔
                      </text>
                      <line x1={335} y1={y + 14} x2={314} y2={y + 14} stroke="#38bdf8" strokeWidth={2} markerEnd="url(#arrow-sq)" />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        ) : (
          // ================= QUEUE VIEW (Horizontal FIFO) =================
          <g transform="translate(10, 40)">
            {/* Pipe boundaries */}
            <line x1={30} y1={70} x2={490} y2={70} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
            <line x1={30} y1={150} x2={490} y2={150} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />

            {/* HEAD Label */}
            <g transform="translate(40, 20)">
              <rect x={0} y={0} width={50} height={22} rx={4} fill="#0284c7" />
              <text x={25} y={15} fill="#ffffff" fontSize="10.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                HEAD ⬇
              </text>
            </g>

            {/* TAIL Label */}
            <g transform={`translate(${Math.max(120, 40 + queueItems.length * 64)}, 20)`}>
              <rect x={0} y={0} width={50} height={22} rx={4} fill="#0d9488" />
              <text x={25} y={15} fill="#ffffff" fontSize="10.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                TAIL ⬇
              </text>
            </g>

            {/* Queue Items */}
            {queueItems.map((item, idx) => {
              const x = 40 + idx * 64;
              const isHead = idx === 0;
              const isTail = idx === queueItems.length - 1;
              const isHighlighted = item.highlighted;

              return (
                <g
                  key={item.id}
                  className="tree-node-group"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    if (!onHover) return;
                    const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                    onHover({
                      x: rect ? e.clientX - rect.left : x + 26,
                      y: rect ? e.clientY - rect.top : 110,
                      title: `Queue Item [${item.val}] (Index ${idx})`,
                      category: isHead ? 'Front / Head' : isTail ? 'Rear / Tail' : 'Buffered Item',
                      color: isHighlighted ? '#fbbf24' : '#38bdf8',
                      description: `FIFO Queue element. Dequeued next if at HEAD. Enqueued elements attach at TAIL.`,
                      stats: [
                        { label: 'Value', value: String(item.val) },
                        { label: 'Position', value: `Index ${idx}` },
                        { label: 'Address', value: item.addr },
                        { label: 'Enqueue/Dequeue Complexity', value: 'O(1)' },
                      ],
                    });
                  }}
                  onMouseLeave={() => onHover && onHover(null)}
                >
                  <rect
                    x={x}
                    y={80}
                    width={56}
                    height={60}
                    rx={6}
                    fill={isHighlighted ? '#1e293b' : isHead ? '#0c4a6e' : '#0f172a'}
                    stroke={isHighlighted ? '#fbbf24' : isHead ? '#38bdf8' : 'rgba(255,255,255,0.25)'}
                    strokeWidth={isHighlighted || isHead ? 2 : 1}
                  />
                  <text
                    x={x + 28}
                    y={110}
                    fill="#ffffff"
                    fontSize="11.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {item.val}
                  </text>
                  <text
                    x={x + 28}
                    y={130}
                    fill="#94a3b8"
                    fontSize="8.5"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    idx:{idx}
                  </text>
                </g>
              );
            })}

            {queueItems.length === 0 && (
              <text x={260} y={115} fill="#64748b" fontSize="13" textAnchor="middle" fontFamily="sans-serif">
                Queue is empty. Enqueue elements from controls above.
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
