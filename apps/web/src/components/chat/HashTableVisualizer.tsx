import React, { useState, useCallback } from 'react';
import type { HoveredInfo } from './InteractiveSimulationCard';
import { loadSimulationState, saveSimulationState } from './simulationPersistence';

export interface HashEntry {
  id: string;
  key: string;
  value: string;
  hash: number;
  addr: string;
  nextAddr: string | null;
  highlighted?: boolean;
}

interface HashTableVisualizerProps {
  onHover?: (info: HoveredInfo | null) => void;
  onStateChange?: () => void;
}

const CAPACITY = 8;

const DEFAULT_ENTRIES: Record<number, HashEntry[]> = {
  0: [],
  1: [{ id: 'h-1', key: 'apple', value: '105', hash: 1, addr: '0x20A0', nextAddr: null }],
  2: [
    { id: 'h-2', key: 'cat', value: '42', hash: 2, addr: '0x20F4', nextAddr: '0x2128' },
    { id: 'h-3', key: 'act', value: '99', hash: 2, addr: '0x2128', nextAddr: null }, // collision demo
  ],
  3: [],
  4: [{ id: 'h-4', key: 'data', value: '77', hash: 4, addr: '0x2180', nextAddr: null }],
  5: [{ id: 'h-5', key: 'echo', value: '314', hash: 5, addr: '0x2210', nextAddr: null }],
  6: [],
  7: [],
};

// Compute string hash modulo capacity
function computeHash(key: string, capacity = CAPACITY): { rawHash: number; index: number } {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const index = Math.abs(hash) % capacity;
  return { rawHash: hash, index };
}

export const HashTableVisualizer: React.FC<HashTableVisualizerProps> = ({ onHover, onStateChange }) => {
  const [buckets, setBuckets] = useState<Record<number, HashEntry[]>>(() =>
    loadSimulationState('hash_table_buckets', DEFAULT_ENTRIES)
  );

  const [inputKey, setInputKey] = useState<string>('beta');
  const [inputValue, setInputValue] = useState<string>('250');
  const [searchKey, setSearchKey] = useState<string>('cat');
  const [activeBucket, setActiveBucket] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Hash Table initialized with separate chaining (Capacity = 8).'
  );
  const [lastHashCalc, setLastHashCalc] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const syncPersistence = useCallback(
    (nextBuckets: Record<number, HashEntry[]>) => {
      saveSimulationState('hash_table_buckets', nextBuckets);
      onStateChange?.();
    },
    [onStateChange]
  );

  const totalEntries = Object.values(buckets).reduce((acc, chain) => acc + chain.length, 0);
  const loadFactor = (totalEntries / CAPACITY).toFixed(2);
  const collisionCount = Object.values(buckets).filter((chain) => chain.length > 1).length;

  const handlePut = async () => {
    const k = inputKey.trim();
    const v = inputValue.trim();
    if (!k) return;

    setIsAnimating(true);
    const { rawHash, index } = computeHash(k);
    setActiveBucket(index);
    setLastHashCalc(`hash("${k}") = ${rawHash} ➔ ${rawHash} % 8 = Bucket [${index}]`);
    setStatusMessage(`Computing hash for key "${k}". Mapping to Bucket [${index}].`);
    await new Promise((r) => setTimeout(r, 450));

    const chain = buckets[index] || [];
    const existingIdx = chain.findIndex((e) => e.key === k);

    let nextChain: HashEntry[];
    if (existingIdx >= 0) {
      // Update existing key
      nextChain = [...chain];
      nextChain[existingIdx] = { ...nextChain[existingIdx], value: v, highlighted: true };
      setStatusMessage(`Key "${k}" already exists at Bucket [${index}]. Updated value to "${v}".`);
    } else {
      // Append / Prepend to separate chain
      const hexAddr = `0x${(0x2000 + Math.floor(Math.random() * 0x0fff)).toString(16).toUpperCase()}`;
      const newEntry: HashEntry = {
        id: `h-${Date.now()}`,
        key: k,
        value: v,
        hash: index,
        addr: hexAddr,
        nextAddr: chain.length > 0 ? chain[0].addr : null,
        highlighted: true,
      };
      nextChain = [newEntry, ...chain];
      const hasCollision = chain.length > 0;
      setStatusMessage(
        hasCollision
          ? `⚠️ Hash Collision on Bucket [${index}]! Chaining "${k}" via next pointer (${hexAddr} ➔ ${chain[0].addr}).`
          : `Inserted "${k}" ➔ "${v}" into Bucket [${index}] at address ${hexAddr} (O(1)).`
      );
    }

    const nextBuckets = { ...buckets, [index]: nextChain };
    setBuckets(nextBuckets);
    syncPersistence(nextBuckets);

    setTimeout(() => {
      setBuckets((prev) => ({
        ...prev,
        [index]: prev[index].map((e) => ({ ...e, highlighted: false })),
      }));
      setIsAnimating(false);
      setActiveBucket(null);
    }, 1200);
  };

  const handleGet = async () => {
    const k = searchKey.trim();
    if (!k) return;

    setIsAnimating(true);
    const { index } = computeHash(k);
    setActiveBucket(index);
    setLastHashCalc(`hash("${k}") % 8 = Bucket [${index}]`);
    setStatusMessage(`Searching for key "${k}". Direct index lookup at Bucket [${index}]...`);
    await new Promise((r) => setTimeout(r, 500));

    const chain = buckets[index] || [];
    let found = false;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      // Highlight stepping
      setBuckets((prev) => ({
        ...prev,
        [index]: prev[index].map((e, idx) => ({ ...e, highlighted: idx === i })),
      }));
      setStatusMessage(`Traversing chain node ${i + 1}/${chain.length}: Inspecting key "${entry.key}"...`);
      await new Promise((r) => setTimeout(r, 400));

      if (entry.key === k) {
        found = true;
        setStatusMessage(`✅ Found key "${k}" with value "${entry.value}" at address ${entry.addr} in Bucket [${index}]!`);
        break;
      }
    }

    if (!found) {
      setStatusMessage(`❌ Key "${k}" not found in Bucket [${index}] (Chain reached NULL).`);
    }

    setTimeout(() => {
      setBuckets((prev) => ({
        ...prev,
        [index]: (prev[index] || []).map((e) => ({ ...e, highlighted: false })),
      }));
      setIsAnimating(false);
      setActiveBucket(null);
    }, 1400);
  };

  const handleDelete = () => {
    const k = searchKey.trim();
    if (!k) return;
    const { index } = computeHash(k);
    const chain = buckets[index] || [];
    const filtered = chain.filter((e) => e.key !== k);

    if (filtered.length !== chain.length) {
      const nextBuckets = { ...buckets, [index]: filtered };
      setBuckets(nextBuckets);
      syncPersistence(nextBuckets);
      setStatusMessage(`Deleted key "${k}" from Bucket [${index}]. Unlinked from collision chain.`);
    } else {
      setStatusMessage(`Key "${k}" not found. Nothing to delete.`);
    }
  };

  const handleReset = () => {
    setBuckets(DEFAULT_ENTRIES);
    syncPersistence(DEFAULT_ENTRIES);
    setActiveBucket(null);
    setLastHashCalc(null);
    setStatusMessage('Reset to baseline hash table state.');
  };

  return (
    <div className="hash-table-visualizer" style={{ width: '100%', userSelect: 'none' }}>
      {/* Controls Bar */}
      <div className="tree-controls-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <input
          type="text"
          className="tree-input"
          style={{ width: '70px' }}
          placeholder="Key..."
          value={inputKey}
          disabled={isAnimating}
          onChange={(e) => setInputKey(e.target.value)}
        />
        <input
          type="text"
          className="tree-input"
          style={{ width: '60px' }}
          placeholder="Val..."
          value={inputValue}
          disabled={isAnimating}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          type="button"
          className="sim-btn sim-btn--primary"
          onClick={handlePut}
          disabled={isAnimating}
        >
          + Put(k, v)
        </button>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        <input
          type="text"
          className="tree-input"
          style={{ width: '70px' }}
          placeholder="Search..."
          value={searchKey}
          disabled={isAnimating}
          onChange={(e) => setSearchKey(e.target.value)}
        />
        <button
          type="button"
          className="sim-btn"
          onClick={handleGet}
          disabled={isAnimating}
        >
          🔍 Get(k)
        </button>
        <button
          type="button"
          className="sim-btn"
          onClick={handleDelete}
          disabled={isAnimating}
        >
          Delete(k)
        </button>
        <button
          type="button"
          className="sim-btn"
          onClick={handleReset}
          disabled={isAnimating}
        >
          ↺ Reset
        </button>

        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
          Entries: <strong style={{ color: '#38bdf8' }}>{totalEntries}</strong> | Collisions: <strong style={{ color: '#fbbf24' }}>{collisionCount}</strong> | Load Factor: <strong style={{ color: Number(loadFactor) > 0.75 ? '#f43f5e' : '#34d399' }}>{loadFactor}</strong>
        </span>
      </div>

      {/* Live Hash Calculation & Telemetry Banner */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          borderLeft: '3px solid #fbbf24',
          padding: '6px 12px',
          fontSize: '11.5px',
          color: '#cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'monospace',
        }}
      >
        <span>{statusMessage}</span>
        {lastHashCalc && <span style={{ color: '#38bdf8', fontSize: '10.5px' }}>{lastHashCalc}</span>}
      </div>

      {/* SVG Hash Table Canvas */}
      <svg width="100%" height="280" viewBox="0 0 540 280" style={{ background: '#070709' }}>
        <defs>
          <marker id="arrow-hash" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
        </defs>

        {Array.from({ length: CAPACITY }).map((_, idx) => {
          const y = 20 + idx * 31;
          const chain = buckets[idx] || [];
          const isActive = activeBucket === idx;

          return (
            <g key={`bucket-${idx}`}>
              {/* Bucket Index Cell */}
              <rect
                x={16}
                y={y}
                width={70}
                height={26}
                rx={4}
                fill={isActive ? '#78350f' : '#0f172a'}
                stroke={isActive ? '#fbbf24' : 'rgba(255,255,255,0.18)'}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={51}
                y={y + 17}
                fill={isActive ? '#fbbf24' : '#94a3b8'}
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                [{idx}]
              </text>

              {/* Arrow to chain */}
              <line
                x1={86}
                y1={y + 13}
                x2={104}
                y2={y + 13}
                stroke={chain.length > 0 ? '#38bdf8' : 'rgba(255,255,255,0.12)'}
                strokeWidth={1.5}
                markerEnd={chain.length > 0 ? 'url(#arrow-hash)' : undefined}
              />

              {/* Chain Entries */}
              {chain.length === 0 ? (
                <text x={112} y={y + 17} fill="#475569" fontSize="10.5" fontFamily="monospace">
                  null
                </text>
              ) : (
                chain.map((entry, chainIdx) => {
                  const entryX = 110 + chainIdx * 135;
                  const isHighlighted = entry.highlighted;

                  return (
                    <g
                      key={entry.id}
                      className="tree-node-group"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        if (!onHover) return;
                        const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                        onHover({
                          x: rect ? e.clientX - rect.left : entryX,
                          y: rect ? e.clientY - rect.top : y,
                          title: `Entry: "${entry.key}" ➔ "${entry.value}"`,
                          category: 'Hash Table Bucket Entry',
                          color: isHighlighted ? '#fbbf24' : '#38bdf8',
                          description: `Key "${entry.key}" hashed to bucket ${idx}. Memory allocated at heap address ${entry.addr}. Next in chain: ${entry.nextAddr || 'NULL'}.`,
                          stats: [
                            { label: 'Key', value: entry.key },
                            { label: 'Value', value: entry.value },
                            { label: 'Bucket Index', value: String(idx) },
                            { label: 'Heap Address', value: entry.addr },
                            { label: 'Next Pointer', value: entry.nextAddr || 'NULL' },
                            { label: 'Lookup Complexity', value: 'O(1) Avg, O(n) Worst' },
                          ],
                        });
                      }}
                      onMouseLeave={() => onHover && onHover(null)}
                    >
                      {/* Entry Box */}
                      <rect
                        x={entryX}
                        y={y}
                        width={95}
                        height={26}
                        rx={5}
                        fill={isHighlighted ? '#1e293b' : '#090d16'}
                        stroke={isHighlighted ? '#fbbf24' : '#38bdf8'}
                        strokeWidth={isHighlighted ? 2 : 1.2}
                      />
                      {/* Key:Value Text */}
                      <text
                        x={entryX + 47}
                        y={y + 16}
                        fill="#f1f5f9"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {entry.key}:{entry.value}
                      </text>

                      {/* Next Pointer Arrow if not last */}
                      {chainIdx < chain.length - 1 && (
                        <line
                          x1={entryX + 95}
                          y1={y + 13}
                          x2={entryX + 130}
                          y2={y + 13}
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                          markerEnd="url(#arrow-hash)"
                        />
                      )}
                    </g>
                  );
                })
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
