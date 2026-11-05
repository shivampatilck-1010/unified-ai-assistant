import { INJECTED_SIMULATION_INSPECTOR_HTML } from './simulationInspector';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GraphVisualizer } from './GraphVisualizer';
import { HashTableVisualizer } from './HashTableVisualizer';
import { StackQueueVisualizer } from './StackQueueVisualizer';
import { exportSvgSnapshot, exportPngSnapshot, exportStudyCardMarkdown } from './simulationExporter';
import './InteractiveSimulationCard.css';

export interface InteractiveSimulationCardProps {
  type?:
    | 'atomic-collision'
    | 'nuclear-fusion'
    | 'binary-tree'
    | 'linked-list'
    | 'sorting'
    | 'merge-sort'
    | 'quick-sort'
    | 'photosynthesis'
    | 'photochemical'
    | 'photochemical-reaction'
    | 'photolysis'
    | 'rocket-engine'
    | 'nozzle'
    | 'gas-dynamics'
    | 'propulsion'
    | 'graph'
    | 'dijkstra'
    | 'bfs-dfs'
    | 'hash-table'
    | 'stack-queue'
    | 'stack'
    | 'queue'
    | 'custom-html';
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
  type?: string;
}

interface CollisionRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
}


export interface HoveredInfo {
  x: number;
  y: number;
  title: string;
  category: string;
  color?: string;
  description: string;
  stats?: { label: string; value: string }[];
}

interface TreeNode {
  val: number;
  left?: TreeNode | null;
  right?: TreeNode | null;
  x?: number;
  y?: number;
  highlighted?: boolean;
}

interface LinkedListNode {
  id: string;
  val: number;
  addr: string;
  nextAddr: string | null;
}

export const InteractiveSimulationCard: React.FC<InteractiveSimulationCardProps> = ({
  type = 'atomic-collision',
  title,
  code = '',
}) => {
  const [activeTab, setActiveTab] = useState<'sim' | 'code'>('sim');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [activeSimOverride, setActiveSimOverride] = useState<string | null>(null);
  // Hover Inspector State for Canvas & SVG elements
  const [hoveredInfo, setHoveredInfo] = useState<HoveredInfo | null>(null);
  const hoveredParticleIdRef = useRef<number | null>(null);


  // Determine actual simulation type
  const resolvedType = React.useMemo(() => {
    if (activeSimOverride) return activeSimOverride;
    // If explicitly provided a specific type (other than generic custom-html), use it
    if (type && type !== 'custom-html') return type;

    const lowerCode = code.toLowerCase().trim();
    const typeMatch = code.match(/type:\s*([a-zA-Z0-9_-]+)/i);
    const declaredType = typeMatch ? typeMatch[1].toLowerCase() : '';

    if (
      declaredType === 'graph' ||
      declaredType === 'dijkstra' ||
      declaredType === 'astar' ||
      declaredType === 'bfs' ||
      declaredType === 'dfs' ||
      declaredType === 'bfs-dfs' ||
      lowerCode.includes('dijkstra') ||
      lowerCode.includes('shortest path') ||
      lowerCode.includes('graph') ||
      lowerCode.includes('breadth-first') ||
      lowerCode.includes('depth-first')
    ) {
      return 'graph';
    }
    if (
      declaredType === 'hash-table' ||
      declaredType === 'hashtable' ||
      declaredType === 'hashmap' ||
      lowerCode.includes('hash-table') ||
      lowerCode.includes('hashtable') ||
      lowerCode.includes('hashmap') ||
      lowerCode.includes('separate chaining')
    ) {
      return 'hash-table';
    }
    if (
      declaredType === 'stack' ||
      declaredType === 'queue' ||
      declaredType === 'stack-queue' ||
      lowerCode.includes('stack-queue') ||
      lowerCode.includes('call stack') ||
      lowerCode.includes('lifo') ||
      lowerCode.includes('fifo') ||
      (lowerCode.includes('stack') && lowerCode.includes('queue'))
    ) {
      return 'stack-queue';
    }
    if (
      declaredType === 'linked-list' ||
      declaredType === 'linkedlist' ||
      lowerCode.includes('linked-list') ||
      lowerCode.includes('linked list') ||
      lowerCode.includes('singlylinkedlist')
    ) {
      return 'linked-list';
    }
    if (
      declaredType === 'binary-tree' ||
      declaredType === 'tree' ||
      declaredType === 'bst' ||
      lowerCode.includes('binary-tree') ||
      lowerCode.includes('binarysearchtree') ||
      lowerCode.includes('treenode') ||
      lowerCode.includes('type: binary-tree') ||
      lowerCode.includes('tree')
    ) {
      return 'binary-tree';
    }
    if (
      declaredType === 'nuclear-fusion' ||
      declaredType === 'fusion' ||
      lowerCode.includes('nuclear') ||
      lowerCode.includes('fusion') ||
      lowerCode.includes('deuterium') ||
      lowerCode.includes('tritium')
    ) {
      return 'nuclear-fusion';
    }
    if (
      declaredType === 'photochemical' ||
      declaredType === 'photochemical-reaction' ||
      declaredType === 'photolysis' ||
      declaredType === 'radical' ||
      lowerCode.includes('photochemical') ||
      lowerCode.includes('photolysis') ||
      lowerCode.includes('homolytic') ||
      lowerCode.includes('free radical') ||
      lowerCode.includes('quantum yield') ||
      lowerCode.includes('beer-lambert')
    ) {
      return 'photochemical';
    }
    if (
      declaredType === 'rocket-engine' ||
      declaredType === 'nozzle' ||
      declaredType === 'gas-dynamics' ||
      declaredType === 'propulsion' ||
      declaredType === 'rocket' ||
      declaredType === 'de-laval' ||
      declaredType === 'delaval' ||
      lowerCode.includes('rocket-engine') ||
      lowerCode.includes('de laval') ||
      lowerCode.includes('delaval') ||
      lowerCode.includes('nozzle') ||
      lowerCode.includes('supersonic exhaust') ||
      lowerCode.includes('thrust') ||
      lowerCode.includes('throttle') ||
      lowerCode.includes('o/f ratio')
    ) {
      return 'rocket-engine';
    }
    if (
      declaredType === 'photosynthesis' ||
      declaredType === 'photo' ||
      lowerCode.includes('photosynthesis') ||
      lowerCode.includes('chlorophyll') ||
      lowerCode.includes('chloroplast')
    ) {
      return 'photosynthesis';
    }
    if (
      declaredType === 'merge-sort' ||
      declaredType === 'mergesort' ||
      lowerCode.includes('mergesort') ||
      lowerCode.includes('merge sort') ||
      lowerCode.includes('merge')
    ) {
      return 'merge-sort';
    }
    if (
      declaredType === 'quick-sort' ||
      declaredType === 'quicksort' ||
      lowerCode.includes('quicksort') ||
      lowerCode.includes('quick sort') ||
      lowerCode.includes('quick')
    ) {
      return 'quick-sort';
    }
    if (
      declaredType === 'sorting' ||
      declaredType === 'sort' ||
      lowerCode.includes('sort') ||
      lowerCode.includes('bubblesort')
    ) {
      return 'sorting';
    }
    if (
      declaredType === 'atomic-collision' ||
      declaredType === 'atomic' ||
      lowerCode.includes('atomic') ||
      lowerCode.includes('atom')
    ) {
      return 'atomic-collision';
    }
    if (code.includes('<canvas') || code.includes('<script') || code.includes('<!DOCTYPE') || code.includes('<svg')) {
      return 'custom-html';
    }
    return type || 'custom-html';
  }, [type, code]);

  const defaultTitle = React.useMemo(() => {
    if (title) return title;
    if (resolvedType === 'nuclear-fusion') return 'D-T Nuclear Fusion Reactor Simulation';
    if (resolvedType === 'atomic-collision') return 'Atomic Collisions Simulation';
    if (resolvedType === 'binary-tree') return 'Binary Search Tree Visualizer';
    if (resolvedType === 'linked-list') return 'Singly Linked List Interactive Visualizer';
    if (resolvedType === 'graph') return 'Graph Traversal & Shortest Path (Dijkstra / A* / BFS / DFS)';
    if (resolvedType === 'hash-table') return 'Hash Table & Separate Chaining Collision Visualizer';
    if (resolvedType === 'stack-queue') return 'LIFO Stack & FIFO Buffer Memory Visualizer';
    if (resolvedType === 'photosynthesis') return 'Photosynthesis & Solar Photolysis Simulation';
    if (resolvedType === 'photochemical') return 'Photochemical Reaction & UV Photolysis Simulator';
    if (resolvedType === 'rocket-engine') return 'Rocket Engine & De Laval Nozzle Supersonic Gas Dynamics';
    if (resolvedType === 'merge-sort') return 'Merge Sort (Divide & Conquer O(n log n)) Visualizer';
    if (resolvedType === 'quick-sort') return 'Quick Sort (Partition O(n log n)) Visualizer';
    if (resolvedType === 'sorting') return 'Sorting Algorithm Visualizer';
    return 'Interactive Visual Simulation';
  }, [title, resolvedType]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [_hasSavedState, setHasSavedState] = useState<boolean>(true);

  const handleExportPng = async () => {
    setExportFeedback('Exporting PNG...');
    const ok = await exportPngSnapshot(viewportRef.current, `${resolvedType}_snapshot.png`);
    setExportFeedback(ok ? 'PNG Saved! ✓' : 'Export Failed');
    setTimeout(() => setExportFeedback(null), 2500);
  };

  const handleExportSvg = () => {
    setExportFeedback('Exporting SVG...');
    const ok = exportSvgSnapshot(viewportRef.current, `${resolvedType}_diagram.svg`);
    setExportFeedback(ok ? 'SVG Saved! ✓' : 'No SVG Found');
    setTimeout(() => setExportFeedback(null), 2500);
  };

  const handleExportStudyCard = () => {
    setExportFeedback('Exporting Study Sheet...');
    let timeComp = 'O(1)';
    let spaceComp = 'O(1)';
    let summary = 'Interactive STEM & Algorithmic cognitive visualization.';

    if (resolvedType === 'graph') {
      timeComp = 'O((V + E) log V)';
      spaceComp = 'O(V)';
      summary = 'Graph traversal and shortest-path calculation using Dijkstra, A*, BFS, and DFS with priority queue relaxation.';
    } else if (resolvedType === 'hash-table') {
      timeComp = 'O(1) Average, O(N) Worst';
      spaceComp = 'O(M + N)';
      summary = 'Hash table key-value indexing utilizing separate chaining for collision resolution.';
    } else if (resolvedType === 'stack-queue') {
      timeComp = 'O(1) for all operations';
      spaceComp = 'O(N)';
      summary = 'LIFO Call Stack activation frames and FIFO ring buffer memory representations.';
    } else if (resolvedType === 'merge-sort') {
      timeComp = 'O(N log N)';
      spaceComp = 'O(N)';
      summary = 'Divide and conquer recursive array partitioning and auxiliary linear merging.';
    } else if (resolvedType === 'quick-sort') {
      timeComp = 'O(N log N) Average, O(N²) Worst';
      spaceComp = 'O(log N)';
      summary = 'Partitioning around a pivot element with in-place swaps.';
    } else if (resolvedType === 'binary-tree') {
      timeComp = 'O(log N) Balanced, O(N) Degenerate';
      spaceComp = 'O(N)';
      summary = 'Binary Search Tree invariant: left child < parent <= right child.';
    } else if (resolvedType === 'linked-list') {
      timeComp = 'O(1) Prepend/Delete Head, O(N) Search';
      spaceComp = 'O(N)';
      summary = 'Pointer-linked sequential memory allocation across heap addresses.';
    } else if (resolvedType === 'nuclear-fusion') {
      timeComp = 'Real-time plasma kinetics';
      spaceComp = 'N-body';
      summary = 'Deuterium-Tritium thermonuclear fusion yielding 17.6 MeV per reaction.';
    }

    const ok = exportStudyCardMarkdown({
      title: defaultTitle,
      type: resolvedType,
      summary,
      complexities: {
        time: timeComp,
        space: spaceComp,
      },
      keyInvariants: [
        'Memory addresses simulate physical 64-bit hexadecimal allocation.',
        'Zero layout-shift Obsidian HUD telemetry ensures continuous execution tracking.',
      ],
      currentTelemetry: {
        type: resolvedType,
        exportedAt: new Date().toISOString(),
      },
    });

    setExportFeedback(ok ? 'Study Card Saved! ✓' : 'Export Failed');
    setTimeout(() => setExportFeedback(null), 2500);
  };

  // --- Atomic Collision State ---
  const [temperature, setTemperature] = useState<number>(1.2);
  const [atomCount, setAtomCount] = useState<number>(18);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [avgSpeed, setAvgSpeed] = useState<number>(2.1);
  const [totalEnergy, setTotalEnergy] = useState<number>(84);

  // --- Nuclear Fusion State ---
  const [fusionTempMK, setFusionTempMK] = useState<number>(120); // Millions of Kelvin
  const [magneticFieldT, setMagneticFieldT] = useState<number>(5.5); // Tesla
  const [fusionEvents, setFusionEvents] = useState<number>(0);
  const [energyOutputMeV, setEnergyOutputMeV] = useState<number>(0);

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

  // --- Singly Linked List State ---
  const [listInputVal, setListInputVal] = useState<string>('50');
  const [listNodes, setListNodes] = useState<LinkedListNode[]>([
    { id: 'l-1', val: 12, addr: '0x10A0', nextAddr: '0x10B4' },
    { id: 'l-2', val: 25, addr: '0x10B4', nextAddr: '0x10F8' },
    { id: 'l-3', val: 42, addr: '0x10F8', nextAddr: '0x1120' },
    { id: 'l-4', val: 88, addr: '0x1120', nextAddr: null },
  ]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<string | null>(null);

  // --- Photosynthesis Simulation State ---
  const [lightIntensity, setLightIntensity] = useState<number>(1.2);
  const [co2Level, setCo2Level] = useState<number>(450);
  const [photonsHarvested, setPhotonsHarvested] = useState<number>(1420);
  const [oxygenReleased, setOxygenReleased] = useState<number>(355);
  const [glucoseSynthesizedMg, setGlucoseSynthesizedMg] = useState<number>(59.2);

  // Photosynthesis live loop
  useEffect(() => {
    if (resolvedType !== 'photosynthesis' || isPaused) return;
    const interval = setInterval(() => {
      setPhotonsHarvested((prev) => prev + Math.round(16 * lightIntensity));
      setOxygenReleased((prev) => +(prev + 3.8 * lightIntensity).toFixed(1));
      setGlucoseSynthesizedMg((prev) => +(prev + 0.65 * lightIntensity * (co2Level / 400)).toFixed(2));
    }, 700);
    return () => clearInterval(interval);
  }, [resolvedType, isPaused, lightIntensity, co2Level]);

  // --- Photochemical Reaction Simulation State ---
  const [uvWavelengthNm, setUvWavelengthNm] = useState<number>(310);
  const [uvFluxPct, setUvFluxPct] = useState<number>(80);
  const [reactantCount, setReactantCount] = useState<number>(14);
  const [photonsAbsorbed, setPhotonsAbsorbed] = useState<number>(48);
  const [radicalsFormed, setRadicalsFormed] = useState<number>(96);

  // Photochemical live loop
  useEffect(() => {
    if (resolvedType !== 'photochemical' || isPaused) return;
    const isThresholdMet = uvWavelengthNm <= 494;
    const interval = setInterval(() => {
      if (isThresholdMet) {
        const fluxFactor = uvFluxPct / 100;
        const absorbedInc = Math.max(1, Math.round(2 * fluxFactor * (reactantCount / 14)));
        setPhotonsAbsorbed((prev) => prev + absorbedInc);
        setRadicalsFormed((prev) => prev + absorbedInc * 2);
      }
    }, 850);
    return () => clearInterval(interval);
  }, [resolvedType, isPaused, uvWavelengthNm, uvFluxPct, reactantCount]);

  // --- Rocket Engine & Supersonic Gas Dynamics State ---
  const [isEngineIgnited, setIsEngineIgnited] = useState<boolean>(true);
  const [rocketThrottlePct, setRocketThrottlePct] = useState<number>(85);
  const [rocketAltitudeKm, setRocketAltitudeKm] = useState<number>(0);
  const [rocketOfRatio, setRocketOfRatio] = useState<number>(2.6);
  const [rocketGasFilter, setRocketGasFilter] = useState<'all' | 'H2O' | 'CO2' | 'CO' | 'H2'>('all');
  const [propellantMassKg, setPropellantMassKg] = useState<number>(1420);
  const [totalThrustKn, setTotalThrustKn] = useState<number>(845);
  const [totalMoleculesEjected, setTotalMoleculesEjected] = useState<number>(342000);

  // Live dynamic telemetry calculations
  const chamberPressureMpa = +( (rocketThrottlePct / 100) * (isEngineIgnited ? 7.2 : 0.1) ).toFixed(2);
  const chamberTempK = isEngineIgnited ? Math.round(3150 + (rocketOfRatio - 2.0) * 320) : 295;
  const exitMach = isEngineIgnited ? +(3.2 + (rocketThrottlePct / 100) * 0.4).toFixed(2) : 0;
  const ispSeconds = isEngineIgnited ? Math.round(311 + (rocketAltitudeKm / 100) * 37) : 0;
  const ambientPressureKpa = +(101.3 * Math.exp(-rocketAltitudeKm / 7.2)).toFixed(1);

  // Rocket Engine animation loop
  useEffect(() => {
    if (resolvedType !== 'rocket-engine' || isPaused || !isEngineIgnited) return;
    const interval = setInterval(() => {
      const massRate = +(18.5 * (rocketThrottlePct / 100)).toFixed(1);
      setPropellantMassKg((prev) => Math.max(0, +(prev - massRate * 0.05).toFixed(1)));
      setTotalMoleculesEjected((prev) => prev + Math.round(18000 * (rocketThrottlePct / 100)));
      const baseThrust = 760 * (rocketThrottlePct / 100);
      const vacuumBonus = (rocketAltitudeKm / 100) * 95;
      setTotalThrustKn(Math.round(baseThrust + vacuumBonus));
    }, 400);
    return () => clearInterval(interval);
  }, [resolvedType, isPaused, isEngineIgnited, rocketThrottlePct, rocketAltitudeKm]);

  // --- Sorting Algorithm Visualizer State ---
  const [sortArray, setSortArray] = useState<number[]>([45, 12, 85, 32, 64, 21, 93, 54, 76, 18, 41, 60]);
  const [comparingIdx, setComparingIdx] = useState<[number, number] | null>(null);
  const [sortedIndices, setSortedIndices] = useState<number[]>([]);
  const [comparisons, setComparisons] = useState<number>(0);
  const [swaps, setSwaps] = useState<number>(0);
  const [isSorting, setIsSorting] = useState<boolean>(false);
  const [sortAlgo, setSortAlgo] = useState<'merge' | 'quick' | 'bubble'>('merge');
  const [mergeRange, setMergeRange] = useState<{ left: number; mid: number; right: number } | null>(null);
  const [pivotIdx, setPivotIdx] = useState<number | null>(null);
  const [sortStatusText, setSortStatusText] = useState<string>('Ready to sort');
  const sortCancelRef = useRef<boolean>(false);

  useEffect(() => {
    if (resolvedType === 'merge-sort' || code.toLowerCase().includes('merge')) {
      setSortAlgo('merge');
      setSortStatusText('Merge Sort (Divide & Conquer O(N log N)) ready');
    } else if (resolvedType === 'quick-sort' || code.toLowerCase().includes('quick')) {
      setSortAlgo('quick');
      setSortStatusText('Quick Sort (Partition O(N log N)) ready');
    } else if (code.toLowerCase().includes('bubble')) {
      setSortAlgo('bubble');
      setSortStatusText('Bubble Sort (Adjacent Swaps O(N²)) ready');
    }
  }, [resolvedType, code]);

  const handleShuffleSort = () => {
    sortCancelRef.current = true;
    setIsSorting(false);
    setComparingIdx(null);
    setMergeRange(null);
    setPivotIdx(null);
    setSortedIndices([]);
    setComparisons(0);
    setSwaps(0);
    setSortStatusText('Array randomized. Choose an algorithm and press Start.');
    setSortArray((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  // --- MERGE SORT (Divide & Conquer O(n log n)) ---
  const handleStartMergeSort = async () => {
    if (isSorting) return;
    setIsSorting(true);
    sortCancelRef.current = false;
    setSortedIndices([]);
    setComparingIdx(null);
    setPivotIdx(null);
    let compCount = 0;
    let auxWrites = 0;
    setComparisons(0);
    setSwaps(0);
    setSortStatusText('Starting Merge Sort (Divide & Conquer)...');

    const arr = [...sortArray];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const merge = async (left: number, mid: number, right: number) => {
      if (sortCancelRef.current) return;
      setMergeRange({ left, mid, right });
      setSortStatusText(`Divide: Merging sub-arrays [${left}..${mid}] and [${mid + 1}..${right}]`);
      await sleep(180);

      const leftPart = arr.slice(left, mid + 1);
      const rightPart = arr.slice(mid + 1, right + 1);

      let i = 0;
      let j = 0;
      let k = left;

      while (i < leftPart.length && j < rightPart.length) {
        if (sortCancelRef.current) return;
        setComparingIdx([left + i, mid + 1 + j]);
        compCount++;
        setComparisons(compCount);
        setSortStatusText(`Comparing left: ${leftPart[i]} with right: ${rightPart[j]}`);
        await sleep(140);

        if (leftPart[i] <= rightPart[j]) {
          arr[k] = leftPart[i];
          i++;
        } else {
          arr[k] = rightPart[j];
          j++;
        }
        auxWrites++;
        setSwaps(auxWrites);
        setSortArray([...arr]);
        k++;
        await sleep(90);
      }

      while (i < leftPart.length) {
        if (sortCancelRef.current) return;
        arr[k] = leftPart[i];
        i++;
        k++;
        auxWrites++;
        setSwaps(auxWrites);
        setSortArray([...arr]);
        await sleep(60);
      }

      while (j < rightPart.length) {
        if (sortCancelRef.current) return;
        arr[k] = rightPart[j];
        j++;
        k++;
        auxWrites++;
        setSwaps(auxWrites);
        setSortArray([...arr]);
        await sleep(60);
      }

      const mergedSoFar: number[] = [];
      for (let m = left; m <= right; m++) mergedSoFar.push(m);
      setSortedIndices((prev) => Array.from(new Set([...prev, ...mergedSoFar])));
    };

    const mergeSortHelper = async (left: number, right: number) => {
      if (left >= right || sortCancelRef.current) return;
      const mid = Math.floor((left + right) / 2);
      setSortStatusText(`Divide: Splitting at mid [${mid}] into [${left}..${mid}] & [${mid + 1}..${right}]`);
      await sleep(120);

      await mergeSortHelper(left, mid);
      await mergeSortHelper(mid + 1, right);
      await merge(left, mid, right);
    };

    await mergeSortHelper(0, arr.length - 1);

    if (!sortCancelRef.current) {
      setComparingIdx(null);
      setMergeRange(null);
      setSortedIndices(arr.map((_, i) => i));
      setSortStatusText(`✅ Merge Sort Complete! Comparisons: ${compCount} | Auxiliary Writes: ${auxWrites}`);
    }
    setIsSorting(false);
  };

  // --- QUICK SORT (Pivot & Partition O(n log n)) ---
  const handleStartQuickSort = async () => {
    if (isSorting) return;
    setIsSorting(true);
    sortCancelRef.current = false;
    setSortedIndices([]);
    setComparingIdx(null);
    setMergeRange(null);
    let compCount = 0;
    let swapCount = 0;
    setComparisons(0);
    setSwaps(0);
    setSortStatusText('Starting Quick Sort (Pivot & Partition)...');

    const arr = [...sortArray];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const partition = async (low: number, high: number): Promise<number> => {
      const pivot = arr[high];
      setPivotIdx(high);
      setSortStatusText(`Selected Pivot = ${pivot} at index [${high}]`);
      await sleep(200);

      let i = low - 1;
      for (let j = low; j < high; j++) {
        if (sortCancelRef.current) return -1;
        setComparingIdx([j, high]);
        compCount++;
        setComparisons(compCount);
        await sleep(120);

        if (arr[j] < pivot) {
          i++;
          const temp = arr[i];
          arr[i] = arr[j];
          arr[j] = temp;
          swapCount++;
          setSwaps(swapCount);
          setSortArray([...arr]);
          await sleep(80);
        }
      }

      const temp = arr[i + 1];
      arr[i + 1] = arr[high];
      arr[high] = temp;
      swapCount++;
      setSwaps(swapCount);
      setSortArray([...arr]);
      setPivotIdx(i + 1);
      setSortedIndices((prev) => Array.from(new Set([...prev, i + 1])));
      setSortStatusText(`Pivot ${pivot} placed in sorted position [${i + 1}]`);
      await sleep(150);

      return i + 1;
    };

    const quickSortHelper = async (low: number, high: number) => {
      if (low < high && !sortCancelRef.current) {
        const pi = await partition(low, high);
        if (pi === -1) return;
        await quickSortHelper(low, pi - 1);
        await quickSortHelper(pi + 1, high);
      } else if (low === high) {
        setSortedIndices((prev) => Array.from(new Set([...prev, low])));
      }
    };

    await quickSortHelper(0, arr.length - 1);

    if (!sortCancelRef.current) {
      setComparingIdx(null);
      setPivotIdx(null);
      setSortedIndices(arr.map((_, i) => i));
      setSortStatusText(`✅ Quick Sort Complete! Comparisons: ${compCount} | Swaps: ${swapCount}`);
    }
    setIsSorting(false);
  };

  // --- BUBBLE SORT (Adjacent Swaps O(n²)) ---
  const handleStartBubbleSort = async () => {
    if (isSorting) return;
    setIsSorting(true);
    sortCancelRef.current = false;
    setSortedIndices([]);
    setMergeRange(null);
    setPivotIdx(null);
    const arr = [...sortArray];
    const n = arr.length;
    let compCount = 0;
    let swapCount = 0;
    setComparisons(0);
    setSwaps(0);
    setSortStatusText('Starting Bubble Sort (Adjacent Comparisons)...');

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i - 1; j++) {
        if (sortCancelRef.current) return;
        setComparingIdx([j, j + 1]);
        compCount++;
        setComparisons(compCount);
        setSortStatusText(`Comparing arr[${j}] (${arr[j]}) with arr[${j + 1}] (${arr[j + 1]})`);
        await new Promise((r) => setTimeout(r, 120));

        if (arr[j] > arr[j + 1]) {
          const temp = arr[j];
          arr[j] = arr[j + 1];
          arr[j + 1] = temp;
          swapCount++;
          setSwaps(swapCount);
          setSortArray([...arr]);
          await new Promise((r) => setTimeout(r, 80));
        }
      }
      setSortedIndices((prev) => [...prev, n - i - 1]);
    }
    setComparingIdx(null);
    setSortedIndices(arr.map((_, idx) => idx));
    setSortStatusText(`✅ Bubble Sort Complete! Comparisons: ${compCount} | Swaps: ${swapCount}`);
    setIsSorting(false);
  };

  const handleStartSort = () => {
    if (sortAlgo === 'merge') {
      void handleStartMergeSort();
    } else if (sortAlgo === 'quick') {
      void handleStartQuickSort();
    } else {
      void handleStartBubbleSort();
    }
  };

  // =========================================================================
  // ATOMIC COLLISION SIMULATOR ENGINE
  // =========================================================================
  const initAtomicParticles = useCallback((count: number, temp: number) => {
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

      const x = radius + Math.random() * Math.max(10, width - radius * 2);
      const y = radius + Math.random() * Math.max(10, height - radius * 2);

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

  // =========================================================================
  // NUCLEAR FUSION SIMULATOR ENGINE (Deuterium + Tritium -> He4 + Neutron)
  // =========================================================================
  const initFusionPlasma = useCallback((tempMK: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    const particles: Particle[] = [];
    const pairCount = 12; // 12 Deuterium + 12 Tritium

    for (let i = 0; i < pairCount * 2; i++) {
      const isDeuterium = i % 2 === 0;
      const radius = isDeuterium ? 7.5 : 9.5;
      const mass = isDeuterium ? 2.0 : 3.0;
      const color = isDeuterium ? '#38bdf8' : '#22d3ee'; // Deuterium (sky blue), Tritium (cyan)

      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(width, height) * 0.35;
      const x = width / 2 + Math.cos(angle) * r;
      const y = height / 2 + Math.sin(angle) * r;

      const speed = (tempMK / 40) * (1.2 + Math.random() * 0.8);
      const vAngle = Math.random() * Math.PI * 2;
      const vx = Math.cos(vAngle) * speed;
      const vy = Math.sin(vAngle) * speed;

      particles.push({
        id: i,
        x,
        y,
        vx,
        vy,
        radius,
        mass,
        color,
        type: isDeuterium ? 'D' : 'T',
      });
    }

    particlesRef.current = particles;
    ringsRef.current = [];
    setFusionEvents(0);
    setEnergyOutputMeV(0);
  }, []);

  // Inject additional D-T fuel pellet
  const handleInjectFuel = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    const newParticles: Particle[] = [];
    for (let i = 0; i < 4; i++) {
      const isDeuterium = i % 2 === 0;
      const radius = isDeuterium ? 7.5 : 9.5;
      const mass = isDeuterium ? 2.0 : 3.0;
      const color = isDeuterium ? '#38bdf8' : '#22d3ee';
      const x = width / 2 + (Math.random() - 0.5) * 60;
      const y = height / 2 + (Math.random() - 0.5) * 60;
      const speed = (fusionTempMK / 40) * 1.5;
      const angle = Math.random() * Math.PI * 2;
      newParticles.push({
        id: Date.now() + i,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        mass,
        color,
        type: isDeuterium ? 'D' : 'T',
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];
  };

  
  // Mouse Hover Detection Handler for Canvas Particles
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const particles = particlesRef.current;
    let closest: Particle | null = null;
    let minDist = Infinity;

    for (const p of particles) {
      const dist = Math.hypot(p.x - mouseX, p.y - mouseY);
      if (dist <= p.radius + 15 && dist < minDist) {
        closest = p;
        minDist = dist;
      }
    }

    if (closest) {
      hoveredParticleIdRef.current = closest.id;
      const spd = Math.hypot(closest.vx, closest.vy);
      const ke = (0.5 * closest.mass * spd * spd).toFixed(1);

      if (resolvedType === 'nuclear-fusion') {
        let title = 'Deuterium Nucleus (²H)';
        let category = 'Hydrogen Isotope';
        let desc = 'Consists of 1 proton and 1 neutron. In magnetic confinement fusion, it fuses with Tritium at extreme temperatures (>100M K) to overcome Coulomb repulsion.';
        let color = closest.color;
        let extraStats = [
          { label: 'Protons (Z)', value: '1' },
          { label: 'Neutrons (N)', value: '1' },
          { label: 'Atomic Mass', value: '2.014 amu' },
        ];

        if (closest.type === 'T') {
          title = 'Tritium Nucleus (³H)';
          category = 'Heavy Hydrogen Isotope';
          desc = 'Consists of 1 proton and 2 neutrons. Exhibits the largest fusion cross-section with Deuterium at achievable tokamak temperatures.';
          extraStats = [
            { label: 'Protons (Z)', value: '1' },
            { label: 'Neutrons (N)', value: '2' },
            { label: 'Atomic Mass', value: '3.016 amu' },
          ];
        } else if (closest.type === 'He4') {
          title = 'Helium-4 Nucleus (⁴He Alpha)';
          category = 'Fusion Ash / Alpha Particle';
          desc = 'Doubly ionized helium nucleus (2 protons, 2 neutrons) released from D-T fusion, carrying 3.5 MeV of energy that provides self-sustaining plasma heating.';
          extraStats = [
            { label: 'Composition', value: '2p + 2n' },
            { label: 'Energy', value: '3.5 MeV' },
            { label: 'Role', value: 'Alpha Heating' },
          ];
        } else if (closest.type === 'neutron') {
          title = 'High-Energy Fast Neutron (n)';
          category = 'Uncharged Baryon';
          desc = 'High-speed neutral nucleon carrying 14.1 MeV of kinetic energy. Unaffected by the magnetic field, it escapes to deposit thermal heat into the lithium blanket.';
          extraStats = [
            { label: 'Electric Charge', value: '0 (Neutral)' },
            { label: 'Kinetic Energy', value: '14.1 MeV' },
            { label: 'Confinement', value: 'Escaping Wall' },
          ];
        }

        setHoveredInfo({
          x: mouseX,
          y: mouseY,
          title,
          category,
          color,
          description: desc,
          stats: [
            ...extraStats,
            { label: 'Velocity', value: `${spd.toFixed(1)} px/f` },
            { label: 'Kinetic Energy', value: `${ke} MeV` },
          ],
        });
      } else {
        // atomic-collision
        const isHeavy = closest.mass > 2;
        const title = isHeavy ? 'Heavy Core Atom (4u)' : 'Light Gas Atom (1u)';
        const category = isHeavy ? 'Heavy Inertial Atom' : 'Light Volatile Atom';
        const desc = isHeavy
          ? 'High-mass atom with high momentum and inertia. When colliding with lighter atoms, it deflects slightly while transferring substantial velocity and kinetic energy.'
          : 'Low-mass gas atom. Bounces off heavier cores with rapid rebound speeds, dispersing kinetic energy throughout the container volume according to elastic collision laws.';

        setHoveredInfo({
          x: mouseX,
          y: mouseY,
          title,
          category,
          color: closest.color,
          description: desc,
          stats: [
            { label: 'Atomic Mass', value: `${closest.mass} u` },
            { label: 'Speed', value: `${spd.toFixed(1)} km/s` },
            { label: 'Kinetic Energy', value: `${ke} J` },
            { label: 'Collision Radius', value: `${closest.radius} Å` },
          ],
        });
      }
    } else {
      hoveredParticleIdRef.current = null;
      setHoveredInfo(null);
    }
  };

  const handleCanvasMouseLeave = () => {
    hoveredParticleIdRef.current = null;
    setHoveredInfo(null);
  };

  // Run Canvas Simulation Animation Loop (Atomic Collision OR Nuclear Fusion)
  useEffect(() => {
    if ((resolvedType !== 'atomic-collision' && resolvedType !== 'nuclear-fusion') || activeTab !== 'sim') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    if (resolvedType === 'atomic-collision') {
      initAtomicParticles(atomCount, temperature);
    } else {
      initFusionPlasma(fusionTempMK);
    }

    let lastTelemetryUpdate = performance.now();

    const loop = () => {
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, width, height);

      // Render Tokamak Magnetic Chamber Ring for Nuclear Fusion
      if (resolvedType === 'nuclear-fusion') {
        const torusRadius = Math.min(width, height) * 0.42;
        ctx.beginPath();
        ctx.arc(centerX, centerY, torusRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, torusRadius * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1;
        for (let r = torusRadius * 0.5; r < torusRadius; r += 20) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
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
      }

      const particles = particlesRef.current;
      const rings = ringsRef.current;

      if (!isPaused) {
        // 1. Particle Movement & Magnetic Confinement
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;

          if (resolvedType === 'nuclear-fusion') {
            if (p.type !== 'neutron') {
              const dx = p.x - centerX;
              const dy = p.y - centerY;
              const distFromCenter = Math.hypot(dx, dy);
              const confinementRadius = Math.min(width, height) * 0.4;

              if (distFromCenter > confinementRadius) {
                const nx = dx / distFromCenter;
                const ny = dy / distFromCenter;
                const dot = p.vx * nx + p.vy * ny;
                p.vx -= 2 * dot * nx;
                p.vy -= 2 * dot * ny;
                p.x = centerX + nx * confinementRadius;
                p.y = centerY + ny * confinementRadius;
              } else {
                const lorentz = (magneticFieldT / 10) * 0.04;
                p.vx += -dy * lorentz;
                p.vy += dx * lorentz;
              }
            } else {
              if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
                particles.splice(i, 1);
                i--;
                continue;
              }
            }
          } else {
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
        }

        // 2. Pairwise Collisions & Nuclear Fusion Reactions
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const minDist = p1.radius + p2.radius;

            if (dist < minDist && dist > 0) {
              if (
                resolvedType === 'nuclear-fusion' &&
                ((p1.type === 'D' && p2.type === 'T') || (p1.type === 'T' && p2.type === 'D'))
              ) {
                const relSpeed = Math.hypot(p1.vx - p2.vx, p1.vy - p2.vy);
                const fusionThreshold = 3.5 * (100 / Math.max(20, fusionTempMK));

                if (relSpeed > fusionThreshold) {
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;

                  rings.push({
                    x: midX,
                    y: midY,
                    radius: 10,
                    maxRadius: 75,
                    opacity: 1.0,
                    color: '#ffffff',
                  });
                  rings.push({
                    x: midX,
                    y: midY,
                    radius: 5,
                    maxRadius: 55,
                    opacity: 0.9,
                    color: '#fbbf24',
                  });

                  p1.type = 'He4';
                  p1.radius = 12;
                  p1.mass = 4;
                  p1.color = '#c084fc';
                  p1.vx = (Math.random() - 0.5) * 4;
                  p1.vy = (Math.random() - 0.5) * 4;

                  p2.type = 'neutron';
                  p2.radius = 4.5;
                  p2.mass = 1;
                  p2.color = '#ffffff';
                  const nAngle = Math.random() * Math.PI * 2;
                  p2.vx = Math.cos(nAngle) * 9;
                  p2.vy = Math.sin(nAngle) * 9;

                  setFusionEvents((fe) => fe + 1);
                  setEnergyOutputMeV((eo) => eo + 17.6);
                  continue;
                }
              }

              const nx = dx / dist;
              const ny = dy / dist;
              const kx = p1.vx - p2.vx;
              const ky = p1.vy - p2.vy;
              const p = 2 * (nx * kx + ny * ky) / (p1.mass + p2.mass);

              if (p > 0) {
                p1.vx -= p * p2.mass * nx;
                p1.vy -= p * p2.mass * ny;
                p2.vx += p * p1.mass * nx;
                p2.vy += p * p1.mass * ny;

                rings.push({
                  x: (p1.x + p2.x) / 2,
                  y: (p1.y + p2.y) / 2,
                  radius: minDist * 0.4,
                  maxRadius: minDist * 1.8,
                  opacity: 0.85,
                  color: resolvedType === 'nuclear-fusion' ? '#38bdf8' : '#fbbf24',
                });

                setCollisionCount((c) => c + 1);
              }

              const overlap = 0.5 * (minDist - dist);
              p1.x -= overlap * nx;
              p1.y -= overlap * ny;
              p2.x += overlap * nx;
              p2.y += overlap * ny;
            }
          }
        }
      }

      // 3. Render Shockwave Rings
      for (let rIdx = rings.length - 1; rIdx >= 0; rIdx--) {
        const ring = rings[rIdx];
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color === '#ffffff' ? `rgba(255, 255, 255, ${ring.opacity})` : `rgba(251, 191, 36, ${ring.opacity})`;
        ctx.lineWidth = ring.color === '#ffffff' ? 3.5 : 2;
        ctx.stroke();

        ring.radius += 2.0;
        ring.opacity -= 0.04;

        if (ring.opacity <= 0 || ring.radius >= ring.maxRadius) {
          rings.splice(rIdx, 1);
        }
      }

      // 4. Render Particles
      for (const p of particles) {
        const gradient = ctx.createRadialGradient(p.x, p.y, p.radius * 0.2, p.x, p.y, p.radius * 1.6);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(0.8, p.color);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (resolvedType === 'nuclear-fusion' && p.radius >= 7) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(p.type || '', p.x, p.y + 3);
        }
      }

      // 5. Periodic Telemetry Calculation
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
  }, [
    resolvedType,
    activeTab,
    isPaused,
    atomCount,
    temperature,
    fusionTempMK,
    magneticFieldT,
    initAtomicParticles,
    initFusionPlasma,
  ]);

  const handleTemperatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTemp = parseFloat(e.target.value);
    setTemperature(newTemp);
    const ratio = newTemp / (temperature || 1);
    for (const p of particlesRef.current) {
      p.vx *= ratio;
      p.vy *= ratio;
    }
  };

  const handleAtomCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(e.target.value, 10);
    setAtomCount(newCount);
    initAtomicParticles(newCount, temperature);
  };

  const handleFusionTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMK = parseInt(e.target.value, 10);
    setFusionTempMK(newMK);
    const ratio = newMK / (fusionTempMK || 1);
    for (const p of particlesRef.current) {
      p.vx *= Math.sqrt(ratio);
      p.vy *= Math.sqrt(ratio);
    }
  };

  const handleMagneticFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMagneticFieldT(parseFloat(e.target.value));
  };

  // =========================================================================
  // BINARY TREE ENGINE
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
    setSearchStatus(`Inserted node: ${val}`);
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
        ? `Found ${val}! Path: ${path.join(' ⟶ ')}`
        : `${val} not found. Path: ${path.join(' ⟶ ')}`
    );
  };

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
        <g
          key={`node-${node.val}`}
          className="tree-node-group"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : x,
              y: rect ? e.clientY - rect.top : y,
              title: `BST Node [${node.val}]`,
              category: node === treeRoot ? 'Root Node' : !node.left && !node.right ? 'Leaf Node' : 'Internal Branch Node',
              color: isTarget ? '#10b981' : isHighlighted ? '#3b82f6' : '#818cf8',
              description: `Binary Search Tree node storing key ${node.val}. All keys in its left subtree are strictly < ${node.val}, while all keys in its right subtree are strictly > ${node.val}.`,
              stats: [
                { label: 'Key Value', value: String(node.val) },
                { label: 'Left Child', value: node.left ? String(node.left.val) : 'null' },
                { label: 'Right Child', value: node.right ? String(node.right.val) : 'null' },
                { label: 'Complexity', value: 'O(log N)' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
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
  // SINGLY LINKED LIST ENGINE
  // =========================================================================
  const generateHexAddr = () =>
    '0x' + (Math.floor(Math.random() * 0xe000) + 0x1000).toString(16).toUpperCase();

  const handlePrependHead = () => {
    const val = parseInt(listInputVal.trim(), 10);
    if (isNaN(val)) return;
    const newAddr = generateHexAddr();
    setListNodes((prev) => {
      const nextAddr = prev.length > 0 ? prev[0].addr : null;
      const newNode: LinkedListNode = {
        id: `l-${Date.now()}`,
        val,
        addr: newAddr,
        nextAddr,
      };
      return [newNode, ...prev];
    });
    setListStatus(`Prepended [${val}] at Head (O(1))`);
    setListInputVal('');
  };

  const handleAppendTail = () => {
    const val = parseInt(listInputVal.trim(), 10);
    if (isNaN(val)) return;
    const newAddr = generateHexAddr();
    setListNodes((prev) => {
      const newNode: LinkedListNode = {
        id: `l-${Date.now()}`,
        val,
        addr: newAddr,
        nextAddr: null,
      };
      if (prev.length === 0) return [newNode];
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        nextAddr: newAddr,
      };
      return [...updated, newNode];
    });
    setListStatus(`Appended [${val}] at Tail (O(n))`);
    setListInputVal('');
  };

  const handleDeleteHead = () => {
    if (listNodes.length === 0) return;
    const removedVal = listNodes[0].val;
    setListNodes((prev) => prev.slice(1));
    setListStatus(`Deleted Head node [${removedVal}] (O(1))`);
  };

  const handleSearchList = async () => {
    const val = parseInt(listInputVal.trim(), 10);
    if (isNaN(val) || listNodes.length === 0) return;
    setListStatus(`Searching for [${val}]...`);
    let found = false;

    for (let i = 0; i < listNodes.length; i++) {
      setHighlightedNodeId(listNodes[i].id);
      await new Promise((r) => setTimeout(r, 380));
      if (listNodes[i].val === val) {
        found = true;
        setListStatus(`Found [${val}] at index ${i} (${listNodes[i].addr})!`);
        break;
      }
    }

    if (!found) {
      setListStatus(`Value [${val}] not found in list (reached NULL).`);
      setHighlightedNodeId(null);
    }
  };

  const handleResetList = () => {
    setListNodes([
      { id: 'l-1', val: 12, addr: '0x10A0', nextAddr: '0x10B4' },
      { id: 'l-2', val: 25, addr: '0x10B4', nextAddr: '0x10F8' },
      { id: 'l-3', val: 42, addr: '0x10F8', nextAddr: '0x1120' },
      { id: 'l-4', val: 88, addr: '0x1120', nextAddr: null },
    ]);
    setHighlightedNodeId(null);
    setListStatus(null);
  };

  const renderLinkedListSvg = () => {
    if (listNodes.length === 0) {
      return (
        <text x="250" y="140" fill="#64748b" textAnchor="middle" fontSize="14">
          Linked List is empty. Prepend or Append nodes above.
        </text>
      );
    }

    const nodeWidth = 66;
    const nodeHeight = 44;
    const gap = 34;
    const startX = 64;
    const y = 140;

    return (
      <svg width="100%" height="280" viewBox="0 0 540 280">
        <defs>
          <marker id="arrow-ll" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-gold-ll" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#fbbf24" />
          </marker>
        </defs>

        {/* HEAD Pointer Tag */}
        <g>
          <rect x={10} y={y - 14} width={42} height={28} rx={4} fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
          <text x={31} y={y + 4} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">HEAD</text>
          <line x1={52} y1={y} x2={startX - 4} y2={y} stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arrow-ll)" />
        </g>

        {listNodes.map((node, i) => {
          const x = startX + i * (nodeWidth + gap);
          const isHighlighted = highlightedNodeId === node.id;
          const isLast = i === listNodes.length - 1;

          return (
            <g
              key={node.id}
              className="tree-node-group"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                setHoveredInfo({
                  x: rect ? e.clientX - rect.left : x,
                  y: rect ? e.clientY - rect.top : y,
                  title: `Node [${node.val}] at ${node.addr}`,
                  category: i === 0 ? 'Head Node' : isLast ? 'Tail Node' : 'Internal Node',
                  color: isHighlighted ? '#fbbf24' : '#38bdf8',
                  description: `Singly Linked List node storing value ${node.val}. Dynamically allocated at heap address ${node.addr}. Next pointer links to ${node.nextAddr || 'NULL (0x0)'}.`,
                  stats: [
                    { label: 'Data', value: String(node.val) },
                    { label: 'Address', value: node.addr },
                    { label: 'Next Pointer', value: node.nextAddr || 'NULL' },
                    { label: 'Insert Complexity', value: 'O(1) at Head' },
                    { label: 'Search Complexity', value: 'O(n)' },
                  ],
                });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
            >
              {/* Memory Block Box */}
              <rect
                x={x}
                y={y - nodeHeight / 2}
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                fill={isHighlighted ? '#1e293b' : '#070913'}
                stroke={isHighlighted ? '#fbbf24' : '#38bdf8'}
                strokeWidth={isHighlighted ? '2.5' : '1.5'}
              />
              {/* Divider between data and pointer */}
              <line
                x1={x + nodeWidth * 0.62}
                y1={y - nodeHeight / 2}
                x2={x + nodeWidth * 0.62}
                y2={y + nodeHeight / 2}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
              />
              {/* Data label */}
              <text x={x + (nodeWidth * 0.62) / 2} y={y + 5} fill="#f8fafc" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                {node.val}
              </text>
              {/* Next pointer dot */}
              <circle cx={x + nodeWidth * 0.81} cy={y} r="4" fill={isHighlighted ? '#fbbf24' : '#38bdf8'} />

              {/* Memory Address under node */}
              <text x={x + nodeWidth / 2} y={y + nodeHeight / 2 + 14} fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                {node.addr}
              </text>

              {/* Arrow to Next Node or NULL */}
              {!isLast ? (
                <line
                  x1={x + nodeWidth}
                  y1={y}
                  x2={x + nodeWidth + gap - 4}
                  y2={y}
                  stroke={isHighlighted ? '#fbbf24' : '#38bdf8'}
                  strokeWidth="2"
                  markerEnd={isHighlighted ? 'url(#arrow-gold-ll)' : 'url(#arrow-ll)'}
                />
              ) : (
                <g>
                  <line
                    x1={x + nodeWidth}
                    y1={y}
                    x2={x + nodeWidth + 20}
                    y2={y}
                    stroke="#ef4444"
                    strokeWidth="1.8"
                  />
                  <rect
                    x={x + nodeWidth + 20}
                    y={y - 10}
                    width={34}
                    height={20}
                    rx={3}
                    fill="#1f1315"
                    stroke="#ef4444"
                    strokeWidth="1"
                  />
                  <text
                    x={x + nodeWidth + 37}
                    y={y + 4}
                    fill="#fca5a5"
                    fontSize="9.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    NULL
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  // =========================================================================
  // PHOTOSYNTHESIS & LIGHT-HARVESTING ENGINE
  // =========================================================================
  const renderPhotosynthesisSvg = () => {
    return (
      <svg width="100%" height="280" viewBox="0 0 540 280">
        <defs>
          <linearGradient id="sunGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="chloroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>

        <rect x="10" y="10" width="520" height="260" rx="12" fill="#06090d" stroke="rgba(255,255,255,0.08)" />

        {/* Sunlight Source */}
        <g
          transform="translate(60, 60)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 60,
              y: rect ? e.clientY - rect.top : 60,
              title: 'Sun (Solar Photon Source)',
              category: 'Electromagnetic Radiation',
              color: '#f59e0b',
              description: 'Continuously radiates electromagnetic energy across the photosynthetically active radiation (PAR) spectrum (400-700 nm) to drive the light reactions.',
              stats: [
                { label: 'Energy Flux', value: '1.2 kW/m²' },
                { label: 'Wavelength', value: '400 - 700 nm' },
                { label: 'Nuclear Origin', value: 'p-p Fusion Chain' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <circle cx="0" cy="0" r="30" fill="url(#sunGlow)" opacity="0.95" />
          <circle cx="0" cy="0" r="42" fill="none" stroke="#fde047" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite" />
          </circle>
          <text x="0" y="4" fill="#0f172a" fontSize="10" fontWeight="bold" textAnchor="middle">SUN</text>
        </g>

        {/* Photon Streams */}
        <line x1="95" y1="75" x2="185" y2="135" stroke="#fef08a" strokeWidth="2.5" strokeDasharray="6 4">
          <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1s" repeatCount="indefinite" />
        </line>
        <line x1="85" y1="95" x2="175" y2="160" stroke="#fef08a" strokeWidth="2" strokeDasharray="6 4">
          <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1.2s" repeatCount="indefinite" />
        </line>
        <text
          x="140"
          y="96"
          fill="#fde047"
          fontSize="10"
          fontFamily="monospace"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 140,
              y: rect ? e.clientY - rect.top : 96,
              title: 'Photon Wavepacket (hν)',
              category: 'Light Energy Quantum',
              color: '#fde047',
              description: 'Discrete packet of solar light energy. Absorbed by chlorophyll pigment antennae in Photosystem II (P680) to excite ground-state electrons to higher orbitals.',
              stats: [
                { label: 'Photon Energy', value: 'E = hν = 2.8 eV' },
                { label: 'Quantum Yield', value: '82%' },
                { label: 'Role', value: 'Photolysis Excitation' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          Photons (hν)
        </text>

        {/* Chloroplast Boundary */}
        <rect x="180" y="40" width="330" height="200" rx="16" fill="rgba(6, 78, 59, 0.25)" stroke="#10b981" strokeWidth="1.5" />
        <text x="195" y="60" fill="#34d399" fontSize="11" fontWeight="bold">CHLOROPLAST (Thylakoids &amp; Stroma)</text>

        {/* Thylakoid Grana Discs */}
        <g
          transform="translate(240, 140)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 240,
              y: rect ? e.clientY - rect.top : 140,
              title: 'Thylakoid Grana & Photosystem II',
              category: 'Light-Harvesting Complex',
              color: '#10b981',
              description: 'Membrane-bound protein complexes with chlorophyll pigments. Splits water (photolysis) to release protons into lumen, generating proton gradients for ATP synthesis.',
              stats: [
                { label: 'Reaction Center', value: 'P680 / P700' },
                { label: 'Photolysis Eq', value: '2H₂O → 4H⁺ + 4e⁻ + O₂' },
                { label: 'Product', value: 'ATP + NADPH' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <ellipse cx="0" cy="-24" rx="36" ry="12" fill="url(#chloroGrad)" stroke="#34d399" />
          <ellipse cx="0" cy="-12" rx="36" ry="12" fill="url(#chloroGrad)" stroke="#34d399" />
          <ellipse cx="0" cy="0" rx="36" ry="12" fill="url(#chloroGrad)" stroke="#34d399" />
          <ellipse cx="0" cy="12" rx="36" ry="12" fill="url(#chloroGrad)" stroke="#34d399" />
          <text x="0" y="3" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle">PS II &amp; PS I</text>
        </g>
        <text x="240" y="175" fill="#a7f3d0" fontSize="10" textAnchor="middle">Light Reaction</text>

        {/* Water Splitting & Oxygen Release */}
        <text x="190" y="210" fill="#38bdf8" fontSize="10">2H₂O in</text>
        <g transform="translate(240, 85)">
          <circle cx="-6" cy="0" r="5" fill="#60a5fa" opacity="0.8">
            <animate attributeName="cy" from="0" to="-25" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0.1" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="6" cy="0" r="6.5" fill="#60a5fa" opacity="0.8">
            <animate attributeName="cy" from="0" to="-30" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0.1" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <text x="18" y="-12" fill="#38bdf8" fontSize="10.5" fontWeight="bold">O₂ ↑ (Released)</text>
        </g>

        {/* Energy Carrier Flow: ATP & NADPH */}
        <path d="M 285 115 C 330 95, 350 95, 380 115" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 3">
          <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
        </path>
        <text x="335" y="98" fill="#fbbf24" fontSize="10" textAnchor="middle">ATP + NADPH</text>

        {/* Calvin Cycle Wheel */}
        <g
          transform="translate(425, 140)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 425,
              y: rect ? e.clientY - rect.top : 140,
              title: 'Calvin-Benson Cycle (Dark Reaction)',
              category: 'Light-Independent Carbon Fixation',
              color: '#c084fc',
              description: 'Occurs in chloroplast stroma. Uses ATP and NADPH from light reactions to enzymatically fix atmospheric CO₂ into 3-carbon sugars and glucose.',
              stats: [
                { label: 'Key Enzyme', value: 'RuBisCO' },
                { label: 'Substrate', value: 'CO₂ + RuBP' },
                { label: 'Output', value: 'G3P → Glucose' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <circle cx="0" cy="0" r="38" fill="none" stroke="#c084fc" strokeWidth="2.5" strokeDasharray="8 4">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
          </circle>
          <text x="0" y="-4" fill="#e9d5ff" fontSize="10" fontWeight="bold" textAnchor="middle">CALVIN</text>
          <text x="0" y="9" fill="#e9d5ff" fontSize="10" fontWeight="bold" textAnchor="middle">CYCLE</text>
        </g>
        <text x="425" y="196" fill="#c084fc" fontSize="10" textAnchor="middle">Light-Independent</text>

        {/* CO2 Input & Glucose Output */}
        <text x="425" y="70" fill="#94a3b8" fontSize="10.5" textAnchor="middle">CO₂ In ↓</text>
        <rect x="385" y="215" width="80" height="22" rx="5" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.2" />
        <text x="425" y="230" fill="#a5b4fc" fontSize="10" fontWeight="bold" textAnchor="middle">C₆H₁₂O₆ (Sugar)</text>
      </svg>
    );
  };

  // =========================================================================
  // PHOTOCHEMICAL REACTION & HOMOLYTIC PHOTOLYSIS SIMULATION ENGINE
  // =========================================================================
  const renderPhotochemicalSvg = () => {
    // Photon Energy: E = hc / λ (eV) = 1239.84 / λ
    const photonEnergyEv = +(1239.84 / uvWavelengthNm).toFixed(2);
    const photonEnergyKj = +(photonEnergyEv * 96.485).toFixed(1);
    const isCleavagePermitted = uvWavelengthNm <= 494; // Threshold for Cl2 bond (242 kJ/mol = 2.51 eV)

    // Molecular coordinates inside the reaction cell
    const moleculePositions = [
      { x: 160, y: 80, angle: 25 },
      { x: 230, y: 70, angle: -40 },
      { x: 310, y: 85, angle: 60 },
      { x: 380, y: 75, angle: -15 },
      { x: 180, y: 140, angle: -30 },
      { x: 260, y: 135, angle: 45 },
      { x: 340, y: 145, angle: -60 },
      { x: 155, y: 200, angle: 70 },
      { x: 230, y: 215, angle: -10 },
      { x: 310, y: 205, angle: 35 },
      { x: 385, y: 210, angle: -50 },
      { x: 200, y: 105, angle: 15 },
      { x: 280, y: 175, angle: -25 },
      { x: 360, y: 115, angle: 40 },
    ].slice(0, reactantCount);

    return (
      <svg width="100%" height="280" viewBox="0 0 540 280">
        <defs>
          <linearGradient id="laserDiodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97757" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
          <radialGradient id="chlorineAtomSphere" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </radialGradient>
          <radialGradient id="radicalAtomSphere" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="45%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#c2410c" />
          </radialGradient>
          <linearGradient id="uvBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97757" stopOpacity={0.85 * (uvFluxPct / 100)} />
            <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.45 * (uvFluxPct / 100)} />
            <stop offset="100%" stopColor="#d97757" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <rect x="8" y="8" width="524" height="264" rx="10" fill="#141312" stroke="rgba(255,255,255,0.06)" />

        {/* 1. UV Laser / Radiation Emitter (Left Dock) */}
        <g
          transform="translate(18, 55)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 65,
              y: rect ? e.clientY - rect.top : 120,
              title: `Pulsed UV Laser Emitter (λ = ${uvWavelengthNm} nm)`,
              category: 'Electromagnetic Radiation Source',
              color: '#d97757',
              description: 'Generates coherent monochromatic ultraviolet photons. If photon energy hν exceeds molecular bond dissociation energy D₀ (242 kJ/mol for Cl₂), homolytic cleavage occurs.',
              stats: [
                { label: 'Wavelength (λ)', value: `${uvWavelengthNm} nm` },
                { label: 'Photon Energy (E = hν)', value: `${photonEnergyEv} eV (${photonEnergyKj} kJ/mol)` },
                { label: 'Frequency (ν)', value: `${(3e8 / (uvWavelengthNm * 1e-9) / 1e14).toFixed(2)} × 10¹⁴ Hz` },
                { label: 'Threshold Condition', value: isCleavagePermitted ? 'hν ≥ D₀ (Cleavage Allowed)' : 'hν < D₀ (Sub-Threshold)' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <rect x="0" y="20" width="60" height="130" rx="8" fill="#1e1c1a" stroke="rgba(217,119,87,0.4)" strokeWidth="1.5" />
          <rect x="52" y="55" width="14" height="60" rx="3" fill="url(#laserDiodeGrad)" stroke="#e08365" strokeWidth="1" />
          <text x="30" y="44" fill="#faf9f5" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            UV LASER
          </text>
          <text x="30" y="60" fill="#e08365" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            {uvWavelengthNm} nm
          </text>
          <text x="30" y="135" fill="#8c877d" fontSize="8" textAnchor="middle" fontFamily="monospace">
            {photonEnergyEv} eV
          </text>
        </g>

        {/* Propagating Photon Wave-Packets */}
        <g opacity={uvFluxPct / 100}>
          <polygon points="66,85 430,45 430,225 66,185" fill="url(#uvBeamGrad)" />

          <path
            d="M 68 115 Q 85 95, 105 115 T 145 115 T 185 115 T 225 115 T 265 115 T 305 115 T 345 115 T 385 115 T 425 115"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.8"
            strokeDasharray="12 6"
          >
            <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.8s" repeatCount="indefinite" />
          </path>
          <path
            d="M 68 145 Q 85 125, 105 145 T 145 145 T 185 145 T 225 145 T 265 145 T 305 145 T 345 145 T 385 145 T 425 145"
            fill="none"
            stroke="#d97757"
            strokeWidth="1.8"
            strokeDasharray="14 7"
          >
            <animate attributeName="stroke-dashoffset" from="42" to="0" dur="0.9s" repeatCount="indefinite" />
          </path>
          <path
            d="M 68 175 Q 85 155, 105 175 T 145 175 T 185 175 T 225 175 T 265 175 T 305 175 T 345 175 T 385 175 T 425 175"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.8"
            strokeDasharray="12 6"
          >
            <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.85s" repeatCount="indefinite" />
          </path>
        </g>

        {/* 2. Reaction Chamber / Quartz Cuvette */}
        <g>
          <rect
            x="120"
            y="35"
            width="310"
            height="210"
            rx="12"
            fill="rgba(36, 34, 32, 0.45)"
            stroke="rgba(217, 119, 87, 0.35)"
            strokeWidth="1.5"
          />
          <text x="135" y="55" fill="#faf9f5" fontSize="10.5" fontWeight="600" fontFamily="'Newsreader', Georgia, serif">
            Quartz Photolysis Cell (Cl₂ Gas, Optical Pathlength l = 1.0 cm)
          </text>
          <text x="360" y="55" fill="#b0aca2" fontSize="9" fontFamily="monospace">
            D₀(Cl₂) = 242 kJ/mol
          </text>

          {/* Diatomic Reactant Molecules & Photolysis Cleavage */}
          {moleculePositions.map((mol, idx) => {
            const isCleaved = isCleavagePermitted && idx % 3 === 0;
            const separation = isCleaved ? 22 : 9;

            return (
              <g
                key={`mol-${idx}`}
                transform={`translate(${mol.x}, ${mol.y}) rotate(${mol.angle})`}
                className="sim-svg-interactive"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                  if (isCleaved) {
                    setHoveredInfo({
                      x: rect ? e.clientX - rect.left : mol.x,
                      y: rect ? e.clientY - rect.top : mol.y,
                      title: 'Chlorine Free Radical Pair (2 Cl•)',
                      category: 'Homolytic Cleavage Product',
                      color: '#e08365',
                      description: 'Homolytic bond fission caused by UV photon absorption (hν ≥ 2.51 eV). Each chlorine atom retains one unpaired valence electron (•) with extreme chemical reactivity.',
                      stats: [
                        { label: 'Spin State', value: 'Doublet (1 Unpaired Electron •)' },
                        { label: 'Propagation Rate', value: 'k = 1.3 × 10¹⁰ M⁻¹s⁻¹' },
                        { label: 'Free Energy', value: 'ΔG > 0 (High Chemical Potential)' },
                        { label: 'Role', value: 'Chain Reaction Carrier' },
                      ],
                    });
                  } else {
                    setHoveredInfo({
                      x: rect ? e.clientX - rect.left : mol.x,
                      y: rect ? e.clientY - rect.top : mol.y,
                      title: 'Chlorine Molecule (Cl₂)',
                      category: 'Ground State Reactant (S₀)',
                      color: '#10b981',
                      description: 'Diatomic covalent molecule. Covalent single σ bond between 3p orbitals. Absorbs UV photons in the 250–400 nm band to promote electrons into σ* antibonding orbitals.',
                      stats: [
                        { label: 'Bond Energy', value: '242 kJ/mol (2.51 eV)' },
                        { label: 'Threshold λ_max', value: '494 nm' },
                        { label: 'State', value: isCleavagePermitted ? 'Excited / Cleaving' : 'Stable Ground State' },
                      ],
                    });
                  }
                }}
                onMouseLeave={() => setHoveredInfo(null)}
              >
                {!isCleaved ? (
                  <line
                    x1={-separation}
                    y1={0}
                    x2={separation}
                    y2={0}
                    stroke="#6ee7b7"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <g>
                    <circle cx="0" cy="0" r="16" fill="rgba(245, 158, 11, 0.22)" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="3 3">
                      <animate attributeName="r" values="8;18;8" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                    <text x="0" y="3.5" fill="#fef08a" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      hν
                    </text>
                  </g>
                )}

                {/* Left Atom */}
                <g transform={`translate(${-separation}, 0)`}>
                  <circle
                    cx="0"
                    cy="0"
                    r="8.5"
                    fill={isCleaved ? 'url(#radicalAtomSphere)' : 'url(#chlorineAtomSphere)'}
                    stroke={isCleaved ? '#f97316' : '#059669'}
                    strokeWidth="1"
                  />
                  <text x="0" y="3.5" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                    Cl
                  </text>
                  {isCleaved && (
                    <circle cx="-6" cy="-6" r="2.5" fill="#fef08a" stroke="#d97757" strokeWidth="0.8" />
                  )}
                </g>

                {/* Right Atom */}
                <g transform={`translate(${separation}, 0)`}>
                  <circle
                    cx="0"
                    cy="0"
                    r="8.5"
                    fill={isCleaved ? 'url(#radicalAtomSphere)' : 'url(#chlorineAtomSphere)'}
                    stroke={isCleaved ? '#f97316' : '#059669'}
                    strokeWidth="1"
                  />
                  <text x="0" y="3.5" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                    Cl
                  </text>
                  {isCleaved && (
                    <circle cx="6" cy="-6" r="2.5" fill="#fef08a" stroke="#d97757" strokeWidth="0.8" />
                  )}
                </g>
              </g>
            );
          })}

          {!isCleavagePermitted && (
            <g transform="translate(140, 120)">
              <rect x="0" y="0" width="270" height="42" rx="6" fill="rgba(18, 17, 16, 0.94)" stroke="#f59e0b" strokeWidth="1" />
              <text x="135" y="18" fill="#f59e0b" fontSize="10.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                ⚠️ SUB-THRESHOLD WAVELENGTH (λ = {uvWavelengthNm} nm)
              </text>
              <text x="135" y="32" fill="#ede8df" fontSize="9" textAnchor="middle" fontFamily="monospace">
                E = {photonEnergyEv} eV &lt; D₀ (2.51 eV). Pure Transmission (No Cleavage).
              </text>
            </g>
          )}
        </g>

        {/* 3. Chain Propagation & Alkane Product Chamber (Right Dock) */}
        <g
          transform="translate(440, 55)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 480,
              y: rect ? e.clientY - rect.top : 120,
              title: 'Propagation Phase (CH₄ Methane Scavenger)',
              category: 'Chain Reaction Kinetics',
              color: '#d97757',
              description: 'Free radicals rapidly abstract hydrogen from alkanes to form hydrogen chloride and alkyl radicals: Cl• + CH₄ ⟶ HCl + •CH₃.',
              stats: [
                { label: 'Reaction 1', value: 'Cl• + CH₄ ⟶ HCl + •CH₃' },
                { label: 'Reaction 2', value: '•CH₃ + Cl₂ ⟶ CH₃Cl + Cl•' },
                { label: 'Activation Barrier', value: 'E_a ≈ 16 kJ/mol' },
                { label: 'Quantum Yield', value: 'Φ ≈ 10⁴ (Chain Multiplication)' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <rect x="0" y="20" width="84" height="130" rx="8" fill="#1e1c1a" stroke="rgba(217,119,87,0.35)" strokeWidth="1.5" />
          <text x="42" y="42" fill="#faf9f5" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            PROPAGATION
          </text>
          <text x="42" y="60" fill="#e08365" fontSize="8" textAnchor="middle" fontFamily="monospace">
            Cl• + CH₄
          </text>

          <rect x="8" y="70" width="68" height="24" rx="4" fill="#242220" stroke="rgba(255,255,255,0.1)" />
          <text x="42" y="86" fill="#34d399" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            HCl (Gas)
          </text>

          <rect x="8" y="102" width="68" height="24" rx="4" fill="#242220" stroke="rgba(255,255,255,0.1)" />
          <text x="42" y="118" fill="#f59e0b" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            •CH₃ Radical
          </text>
        </g>
      </svg>
    );
  };

  // =========================================================================
  // ROCKET ENGINE & DE LAVAL NOZZLE SUPERSONIC GAS DYNAMICS ENGINE
  // =========================================================================
  const renderRocketEngineSvg = () => {
    const isOverexpanded = rocketAltitudeKm < 20; // Sea level atmospheric pinching
    const isUnderexpanded = rocketAltitudeKm > 40; // Deep vacuum flare
    const altRatio = Math.min(1, Math.max(0, rocketAltitudeKm / 100));

    // Gas molecules inside chamber, throat, and supersonic plume
    const chamberMolecules = [
      { id: 'c1', x: 52, y: 105, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'c2', x: 74, y: 135, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'c3', x: 62, y: 172, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'c4', x: 96, y: 112, species: 'CO', formula: 'CO', name: 'Carbon Monoxide', color: '#f87171', pct: '9%' },
      { id: 'c5', x: 114, y: 154, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'c6', x: 86, y: 190, species: 'H2', formula: 'H₂', name: 'Molecular Hydrogen', color: '#c084fc', pct: '5%' },
      { id: 'c7', x: 132, y: 124, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'c8', x: 104, y: 138, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'c9', x: 146, y: 162, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'c10', x: 122, y: 94, species: 'OH', formula: 'OH•', name: 'Hydroxyl Radical', color: '#f43f5e', pct: '<1%' },
    ];

    const throatMolecules = [
      { id: 't1', x: 166, y: 132, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 't2', x: 176, y: 146, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 't3', x: 186, y: 136, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 't4', x: 194, y: 152, species: 'CO', formula: 'CO', name: 'Carbon Monoxide', color: '#f87171', pct: '9%' },
    ];

    const plumeMolecules = [
      { id: 'p1', x: 220, ySpread: -0.25, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p2', x: 236, ySpread: 0.3, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'p3', x: 258, ySpread: -0.45, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p4', x: 274, ySpread: 0.52, species: 'CO', formula: 'CO', name: 'Carbon Monoxide', color: '#f87171', pct: '9%' },
      { id: 'p5', x: 292, ySpread: 0.05, species: 'H2', formula: 'H₂', name: 'Molecular Hydrogen', color: '#c084fc', pct: '5%' },
      { id: 'p6', x: 312, ySpread: -0.65, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p7', x: 326, ySpread: 0.72, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'p8', x: 346, ySpread: -0.15, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p9', x: 362, ySpread: 0.22, species: 'CO', formula: 'CO', name: 'Carbon Monoxide', color: '#f87171', pct: '9%' },
      { id: 'p10', x: 382, ySpread: -0.85, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p11', x: 398, ySpread: 0.9, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p12', x: 418, ySpread: -0.05, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'p13', x: 432, ySpread: -0.42, species: 'H2', formula: 'H₂', name: 'Molecular Hydrogen', color: '#c084fc', pct: '5%' },
      { id: 'p14', x: 448, ySpread: 0.48, species: 'CO', formula: 'CO', name: 'Carbon Monoxide', color: '#f87171', pct: '9%' },
      { id: 'p15', x: 472, ySpread: -1.15, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p16', x: 486, ySpread: 1.2, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
      { id: 'p17', x: 508, ySpread: 0.02, species: 'CO2', formula: 'CO₂', name: 'Carbon Dioxide', color: '#fb923c', pct: '20%' },
      { id: 'p18', x: 524, ySpread: -0.6, species: 'H2', formula: 'H₂', name: 'Molecular Hydrogen', color: '#c084fc', pct: '5%' },
      { id: 'p19', x: 536, ySpread: 0.75, species: 'H2O', formula: 'H₂O', name: 'Superheated Steam', color: '#38bdf8', pct: '66%' },
    ];

    // Compute dynamic plume boundary paths based on altitude
    const upperPlumeY = isOverexpanded
      ? 'M 295 52 C 340 85, 410 108, 545 116'
      : isUnderexpanded
      ? 'M 295 52 C 345 24, 420 10, 545 6'
      : 'M 295 52 C 345 52, 420 54, 545 56';

    const lowerPlumeY = isOverexpanded
      ? 'M 295 228 C 340 195, 410 172, 545 164'
      : isUnderexpanded
      ? 'M 295 228 C 345 256, 420 270, 545 274'
      : 'M 295 228 C 345 228, 420 226, 545 224';

    const plumePolygonPoints = isOverexpanded
      ? '295,52 340,85 410,108 545,116 545,164 410,172 340,195 295,228'
      : isUnderexpanded
      ? '295,52 345,24 420,10 545,6 545,274 420,270 345,256 295,228'
      : '295,52 345,52 420,54 545,56 545,224 420,226 345,228 295,228';

    return (
      <svg width="100%" height="280" viewBox="0 0 560 280">
        <defs>
          {/* Combustion Plasma Gradient */}
          <linearGradient id="rocketChamberFlame" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={isEngineIgnited ? 0.85 : 0.05} />
            <stop offset="40%" stopColor="#f97316" stopOpacity={isEngineIgnited ? 0.92 : 0.05} />
            <stop offset="85%" stopColor="#fbbf24" stopOpacity={isEngineIgnited ? 0.95 : 0.05} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={isEngineIgnited ? 0.98 : 0.05} />
          </linearGradient>

          {/* Supersonic Plume Body Gradient */}
          <linearGradient id="supersonicPlumeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={isEngineIgnited ? 0.95 : 0.02} />
            <stop offset="15%" stopColor="#fef08a" stopOpacity={isEngineIgnited ? 0.8 : 0.02} />
            <stop offset="45%" stopColor="#f97316" stopOpacity={isEngineIgnited ? 0.55 : 0.02} />
            <stop offset="80%" stopColor="#dc2626" stopOpacity={isEngineIgnited ? 0.35 : 0.01} />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity={isEngineIgnited ? 0.1 : 0} />
          </linearGradient>

          {/* Shock Diamond Glowing Radial */}
          <radialGradient id="shockDiamondGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#fef08a" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>

          {/* Regenerative Cooling Jacket Gradient */}
          <linearGradient id="coolingJacketGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d97757" />
            <stop offset="50%" stopColor="#9a3412" />
            <stop offset="100%" stopColor="#431407" />
          </linearGradient>
        </defs>

        <rect x="6" y="6" width="548" height="268" rx="10" fill="#141312" stroke="rgba(255,255,255,0.06)" />

        {/* 1. Supersonic Plume Exhaust Stream (Active When Engine Ignited) */}
        {isEngineIgnited && (
          <g>
            <polygon points={plumePolygonPoints} fill="url(#supersonicPlumeGrad)" />

            <path d={upperPlumeY} fill="none" stroke="rgba(254, 240, 138, 0.45)" strokeWidth="1.5" />
            <path d={lowerPlumeY} fill="none" stroke="rgba(254, 240, 138, 0.45)" strokeWidth="1.5" />

            {/* Supersonic Core Streamlines with High-Speed Animation */}
            <path
              d="M 295 140 L 545 140"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeDasharray="14 8"
              opacity="0.9"
            >
              <animate attributeName="stroke-dashoffset" from="44" to="0" dur="0.25s" repeatCount="indefinite" />
            </path>
            <path
              d="M 295 125 C 340 128, 410 132, 545 135"
              stroke="#fef08a"
              strokeWidth="1.5"
              strokeDasharray="12 6"
              opacity="0.75"
            >
              <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.28s" repeatCount="indefinite" />
            </path>
            <path
              d="M 295 155 C 340 152, 410 148, 545 145"
              stroke="#fef08a"
              strokeWidth="1.5"
              strokeDasharray="12 6"
              opacity="0.75"
            >
              <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.28s" repeatCount="indefinite" />
            </path>
          </g>
        )}

        {/* 2. Oblique Shock Diamonds (Mach Disks Active at Sea Level / Overexpansion) */}
        {isEngineIgnited && isOverexpanded && (
          <g
            className="sim-svg-interactive"
            opacity={Math.max(0.15, 1 - altRatio * 1.6)}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
              setHoveredInfo({
                x: rect ? e.clientX - rect.left : 360,
                y: rect ? e.clientY - rect.top : 140,
                title: 'Oblique Shock Diamond (Mach Disk Reflection)',
                category: 'Overexpanded Aerodynamics (Sea Level)',
                color: '#fde047',
                description: 'At sea level, atmospheric pressure (Pa = 101.3 kPa) is higher than nozzle exit pressure (Pe ≈ 52 kPa). Oblique shock waves reflect inward from the supersonic shear layer, compressing and re-igniting exhaust gases into luminous periodic diamonds.',
                stats: [
                  { label: 'Ambient Pressure (P_a)', value: '101.3 kPa (1.0 atm)' },
                  { label: 'Exit Pressure (P_e)', value: '52.4 kPa (Overexpanded)' },
                  { label: 'Shock Compression Temp', value: '1,840 K (Luminous Reheat)' },
                  { label: 'Diamond Formation', value: 'Prandtl-Meyer Shock Reflection' },
                ],
              });
            }}
            onMouseLeave={() => setHoveredInfo(null)}
          >
            {/* Diamond 1 */}
            <polygon points="325,140 338,127 351,140 338,153" fill="url(#shockDiamondGlow)" stroke="#fde047" strokeWidth="1.4" />
            {/* Diamond 2 */}
            <polygon points="370,140 382,129 394,140 382,151" fill="url(#shockDiamondGlow)" stroke="#f59e0b" strokeWidth="1.2" />
            {/* Diamond 3 */}
            <polygon points="414,140 424,131 434,140 424,149" fill="url(#shockDiamondGlow)" stroke="#f59e0b" strokeWidth="1.0" />
            {/* Diamond 4 */}
            <polygon points="455,140 463,133 471,140 463,147" fill="url(#shockDiamondGlow)" stroke="#f97316" strokeWidth="0.8" />
            {/* Diamond 5 */}
            <polygon points="492,140 498,135 504,140 498,145" fill="url(#shockDiamondGlow)" stroke="#f97316" strokeWidth="0.8" />
          </g>
        )}

        {/* 3. Deep Space Vacuum Flare Indicator */}
        {isEngineIgnited && isUnderexpanded && (
          <g transform="translate(360, 24)">
            <rect x="0" y="0" width="180" height="26" rx="4" fill="rgba(20, 19, 18, 0.88)" stroke="rgba(217, 119, 87, 0.4)" />
            <text x="90" y="17" fill="#faf9f5" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              🌌 VACUUM BELL PLUME (I_sp = {ispSeconds}s)
            </text>
          </g>
        )}

        {/* 4. Combustion Chamber Hot Gas Core */}
        <polygon
          points="36,75 130,75 180,115 180,165 130,205 36,205"
          fill="url(#rocketChamberFlame)"
        />

        {/* 5. De Laval Nozzle Wall Contours & Regenerative Cooling Tubes */}
        <g>
          {/* Upper Chamber & Nozzle Wall */}
          <path
            d="M 24 64 L 130 64 Q 160 64 180 106 Q 215 106 295 40 L 295 52 Q 220 115 180 115 Q 155 75 130 75 L 36 75 L 24 64 Z"
            fill="url(#coolingJacketGrad)"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1"
          />
          {/* Lower Chamber & Nozzle Wall */}
          <path
            d="M 24 216 L 130 216 Q 160 216 180 174 Q 215 174 295 240 L 295 228 Q 220 165 180 165 Q 155 205 130 205 L 36 205 L 24 216 Z"
            fill="url(#coolingJacketGrad)"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1"
          />

          {/* Regenerative Cooling Ribs */}
          {[50, 75, 100, 125, 150, 175, 205, 235, 265].map((rx) => (
            <line
              key={`rib-top-${rx}`}
              x1={rx}
              y1="56"
              x2={rx}
              y2="70"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
            />
          ))}
          {[50, 75, 100, 125, 150, 175, 205, 235, 265].map((rx) => (
            <line
              key={`rib-bot-${rx}`}
              x1={rx}
              y1="210"
              x2={rx}
              y2="224"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
            />
          ))}
        </g>

        {/* 6. Coaxial Injector Face (Left Dock) */}
        <g
          transform="translate(14, 60)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 70,
              y: rect ? e.clientY - rect.top : 140,
              title: 'Coaxial Injector Dome & Propellant Manifold',
              category: 'Cryogenic Injection System',
              color: '#38bdf8',
              description: 'Atomizes liquid oxygen (LOX at 90 K) and methane/kerosene fuel (RP-1) at high differential injection pressure (ΔP = 1.4 MPa), generating fine aerosol mist that combusts stoichiometrically.',
              stats: [
                { label: 'Oxidizer', value: 'Liquid Oxygen (LOX, O₂)' },
                { label: 'Fuel', value: 'Hydrocarbon (CH₄ / RP-1 Kerosene)' },
                { label: 'O/F Mixture Ratio', value: `${rocketOfRatio} : 1` },
                { label: 'Injection ΔP', value: '1.42 MPa' },
                { label: 'Combustion Eq', value: 'CH₄ + 2 O₂ ⟶ CO₂ + 2 H₂O + ΔH' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <rect x="0" y="8" width="18" height="144" rx="3" fill="#1f1e1c" stroke="#38bdf8" strokeWidth="1.2" />
          {/* LOX Injector Ports (Cyan) */}
          {[22, 58, 94, 130].map((iy) => (
            <g key={`lox-${iy}`}>
              <rect x="14" y={iy} width="10" height="5" fill="#38bdf8" />
              <line x1="24" y1={iy + 2.5} x2="36" y2={iy + 2.5} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 2" />
            </g>
          ))}
          {/* Fuel Injector Ports (Terracotta) */}
          {[40, 76, 112].map((iy) => (
            <g key={`fuel-${iy}`}>
              <rect x="14" y={iy} width="10" height="5" fill="#ea580c" />
              <line x1="24" y1={iy + 2.5} x2="36" y2={iy + 2.5} stroke="#ea580c" strokeWidth="1.5" strokeDasharray="3 2" />
            </g>
          ))}
          <text x="8" y="80" fill="#faf9f5" fontSize="7.5" fontWeight="bold" textAnchor="middle" transform="rotate(-90 8 80)" fontFamily="sans-serif">
            INJECTOR
          </text>
        </g>

        {/* 7. Choked Sonic Throat Marker (Mach 1.0) */}
        <g
          transform="translate(180, 112)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 180,
              y: rect ? e.clientY - rect.top : 140,
              title: 'De Laval Nozzle Throat (Choked Sonic Flow)',
              category: 'Transonic Sonic Barrier (Mach 1.0)',
              color: '#fbbf24',
              description: 'The narrowest cross-sectional area (A*) of the nozzle where compressible gas flow reaches acoustic speed (Mach 1.0). Downstream of this geometric boundary, the divergent bell accelerates the gas into supersonic velocities (Mach > 3.4).',
              stats: [
                { label: 'Flow Regime', value: 'Choked Sonic Flow (M = 1.00)' },
                { label: 'Acoustic Speed (a*)', value: '1,120 m/s' },
                { label: 'Critical Pressure (P*)', value: `${(0.564 * +chamberPressureMpa).toFixed(2)} MPa (0.564 Pc)` },
                { label: 'Critical Temp (T*)', value: `${Math.round(chamberTempK * 0.833)} K` },
                { label: 'Mass Flow (ṁ)', value: `${(18.5 * (rocketThrottlePct / 100)).toFixed(1)} kg/s` },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <line x1="0" y1="3" x2="0" y2="53" stroke="#fbbf24" strokeWidth="1.8" strokeDasharray="3 3" />
          <rect x="-18" y="20" width="36" height="16" rx="3" fill="#141312" stroke="#fbbf24" strokeWidth="0.9" />
          <text x="0" y="31.5" fill="#fbbf24" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            M = 1.0
          </text>
        </g>

        {/* 8. Exit Plane Bell Skirt Marker */}
        <g
          transform="translate(295, 45)"
          className="sim-svg-interactive"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
            setHoveredInfo({
              x: rect ? e.clientX - rect.left : 295,
              y: rect ? e.clientY - rect.top : 140,
              title: 'Nozzle Exit Plane (Ae / A* Expansion Ratio)',
              category: 'Supersonic Expansion Boundary',
              color: '#d97757',
              description: 'Divergent bell nozzle contour designed to isentropically expand gas pressure from throat stagnation down to exit pressure Pe. Area expansion ratio ε = Ae / A* ≈ 16.5.',
              stats: [
                { label: 'Expansion Ratio (ε)', value: '16.5 : 1 (Ae / A*)' },
                { label: 'Exit Mach Number', value: `Mach ${exitMach}` },
                { label: 'Exit Velocity (v_e)', value: '3,150 m/s' },
                { label: 'Static Temp (T_e)', value: '1,420 K (Adiabatically Cooled)' },
                { label: 'Reactive Thrust Eq', value: 'F = ṁ · v_e + (P_e - P_a) · A_e' },
              ],
            });
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <line x1="0" y1="7" x2="0" y2="183" stroke="#d97757" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6" />
          <text x="0" y="0" fill="#faf9f5" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            Ae EXIT
          </text>
        </g>

        {/* 9. Interactive Gas Molecules (Chamber, Throat, Plume) */}
        {/* Chamber Molecules */}
        {chamberMolecules.map((mol) => {
          const isHighlighted = rocketGasFilter === 'all' || rocketGasFilter === mol.species;
          const molOpacity = isEngineIgnited ? (isHighlighted ? 0.95 : 0.18) : 0.05;

          return (
            <g
              key={mol.id}
              transform={`translate(${mol.x}, ${mol.y})`}
              className="sim-svg-interactive"
              opacity={molOpacity}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                setHoveredInfo({
                  x: rect ? e.clientX - rect.left : mol.x,
                  y: rect ? e.clientY - rect.top : mol.y,
                  title: `${mol.name} (${mol.formula})`,
                  category: 'Combustion Chamber Product',
                  color: mol.color,
                  description: `Subsonic combustion gas molecule formed in the chamber under extreme pressure (${chamberPressureMpa} MPa) and temperature (${chamberTempK} K). Bounces rapidly, colliding with fellow molecules to maintain stagnation pressure.`,
                  stats: [
                    { label: 'Chemical Species', value: `${mol.formula} (${mol.name})` },
                    { label: 'Flow Velocity', value: 'Subsonic (v ≈ 240 m/s, M ≈ 0.22)' },
                    { label: 'Local Temperature', value: `${chamberTempK} K (${chamberTempK - 273} °C)` },
                    { label: 'Local Pressure', value: `${chamberPressureMpa} MPa (${(+chamberPressureMpa * 9.87).toFixed(0)} atm)` },
                    { label: 'Exhaust Fraction', value: mol.pct },
                  ],
                });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
            >
              <circle cx="0" cy="0" r="4.2" fill={mol.color} stroke="#ffffff" strokeWidth="0.8" />
              {isHighlighted && (
                <text x="0" y="2.8" fill="#141312" fontSize="5.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  {mol.formula.slice(0, 3)}
                </text>
              )}
            </g>
          );
        })}

        {/* Throat Molecules */}
        {throatMolecules.map((mol) => {
          const isHighlighted = rocketGasFilter === 'all' || rocketGasFilter === mol.species;
          const molOpacity = isEngineIgnited ? (isHighlighted ? 0.95 : 0.18) : 0.05;

          return (
            <g
              key={mol.id}
              transform={`translate(${mol.x}, ${mol.y})`}
              className="sim-svg-interactive"
              opacity={molOpacity}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                setHoveredInfo({
                  x: rect ? e.clientX - rect.left : mol.x,
                  y: rect ? e.clientY - rect.top : mol.y,
                  title: `${mol.name} (${mol.formula}) — Choked Flow`,
                  category: 'Transonic Sonic Molecule (Mach 1.0)',
                  color: mol.color,
                  description: `Gas molecule passing through the minimum constriction area (A*). Reaches exactly local speed of sound (acoustic Mach 1.0). All stagnation pressure is converted into directional axial momentum.`,
                  stats: [
                    { label: 'Chemical Formula', value: mol.formula },
                    { label: 'Acoustic Speed (a*)', value: '1,120 m/s (Mach 1.00)' },
                    { label: 'Local Temperature', value: `${Math.round(chamberTempK * 0.833)} K` },
                    { label: 'Exhaust Fraction', value: mol.pct },
                  ],
                });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
            >
              <circle cx="0" cy="0" r="4.2" fill={mol.color} stroke="#fbbf24" strokeWidth="1" />
            </g>
          );
        })}

        {/* Plume Molecules */}
        {plumeMolecules.map((mol) => {
          const spreadFactor = isOverexpanded ? 28 : isUnderexpanded ? 115 : 65;
          const curY = 140 + mol.ySpread * spreadFactor;
          const isHighlighted = rocketGasFilter === 'all' || rocketGasFilter === mol.species;
          const molOpacity = isEngineIgnited ? (isHighlighted ? 0.95 : 0.18) : 0.05;

          return (
            <g
              key={mol.id}
              transform={`translate(${mol.x}, ${curY})`}
              className="sim-svg-interactive"
              opacity={molOpacity}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                setHoveredInfo({
                  x: rect ? e.clientX - rect.left : mol.x,
                  y: rect ? e.clientY - rect.top : curY,
                  title: `Supersonic Exhaust: ${mol.name} (${mol.formula})`,
                  category: 'Supersonic Reaction Plume',
                  color: mol.color,
                  description: `Accelerated supersonic exhaust molecule ejected into ambient atmosphere or vacuum at Mach ${exitMach}. Carrying immense reactive momentum (p = m · v_e), this substance directly generates vehicle upward thrust via Newton's 3rd Law.`,
                  stats: [
                    { label: 'Chemical Species', value: `${mol.formula} (${mol.name})` },
                    { label: 'Exhaust Velocity (v_e)', value: '3,150 m/s (Mach 3.42)' },
                    { label: 'Static Temp (T_e)', value: '1,420 K (Adiabatically Cooled)' },
                    { label: 'Net Thrust (F)', value: `${totalThrustKn} kN` },
                    { label: 'Exhaust Fraction', value: mol.pct },
                  ],
                });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
            >
              <circle cx="0" cy="0" r="3.8" fill={mol.color} stroke="#ffffff" strokeWidth="0.7" />
              {/* Supersonic Mach Cone Trail */}
              <line x1="-8" y1="0" x2="-2" y2="0" stroke={mol.color} strokeWidth="1.2" opacity="0.6" />
            </g>
          );
        })}

        {/* 10. Engine State Banner (When Shutdown) */}
        {!isEngineIgnited && (
          <g transform="translate(160, 115)">
            <rect x="0" y="0" width="240" height="50" rx="8" fill="rgba(18, 17, 16, 0.94)" stroke="#ef4444" strokeWidth="1.5" />
            <text x="120" y="22" fill="#ef4444" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              🛑 ENGINE SHUTDOWN (COLD)
            </text>
            <text x="120" y="38" fill="#ede8df" fontSize="9.5" textAnchor="middle" fontFamily="monospace">
              Combustion halted. Click [🔥 IGNITE ENGINE] to restart flow.
            </text>
          </g>
        )}
      </svg>
    );
  };

  // =========================================================================
  // SORTING ALGORITHM ENGINE (Merge Sort, Quick Sort, Bubble Sort)
  // =========================================================================
  const renderSortingSvg = () => {
    const maxVal = Math.max(...sortArray, 100);
    const barWidth = 32;
    const gap = 10;
    const startX = 26;

    const algoLabel =
      sortAlgo === 'merge'
        ? 'Merge Sort (Divide & Conquer)'
        : sortAlgo === 'quick'
        ? 'Quick Sort (Partitioning)'
        : 'Bubble Sort (Adjacent Swaps)';

    const algoComplexity =
      sortAlgo === 'merge'
        ? 'Time: O(N log N) Guaranteed | Space: O(N) Auxiliary'
        : sortAlgo === 'quick'
        ? 'Time: O(N log N) Average | Space: O(log N)'
        : 'Time: O(N²) Quadratic | Space: O(1)';

    return (
      <svg width="100%" height="300" viewBox="0 0 540 300">
        <rect x="10" y="10" width="520" height="280" rx="12" fill="#06090d" stroke="rgba(255,255,255,0.08)" />

        {/* Algorithm Header Banner */}
        <g transform="translate(24, 28)">
          <text x="0" y="0" fill="#f8fafc" fontSize="13" fontWeight="bold">
            {algoLabel}
          </text>
          <text x="0" y="15" fill="#64748b" fontSize="10.5" fontFamily="monospace">
            {algoComplexity}
          </text>
        </g>

        {/* Live Status Bar */}
        <g transform="translate(24, 62)">
          <rect x="0" y="0" width="492" height="22" rx="4" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" />
          <circle cx="10" cy="11" r="3" fill="#38bdf8" />
          <text x="20" y="14.5" fill="#38bdf8" fontSize="11" fontWeight="500">
            {sortStatusText}
          </text>
        </g>

        {/* Merge Partition Guide Indicator */}
        {sortAlgo === 'merge' && mergeRange && (
          <g>
            {/* Left Sub-array highlight box */}
            {(() => {
              const x1 = startX + mergeRange.left * (barWidth + gap) - 4;
              const w1 = (mergeRange.mid - mergeRange.left + 1) * (barWidth + gap) - gap + 8;
              const x2 = startX + (mergeRange.mid + 1) * (barWidth + gap) - 4;
              const w2 = (mergeRange.right - (mergeRange.mid + 1) + 1) * (barWidth + gap) - gap + 8;
              return (
                <>
                  <rect x={x1} y="90" width={w1} height="15" rx="3" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" strokeWidth="1" />
                  <text x={x1 + w1 / 2} y="101" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">
                    LEFT [{mergeRange.left}..{mergeRange.mid}]
                  </text>
                  <rect x={x2} y="90" width={w2} height="15" rx="3" fill="rgba(244, 63, 94, 0.15)" stroke="#f43f5e" strokeWidth="1" />
                  <text x={x2 + w2 / 2} y="101" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">
                    RIGHT [{mergeRange.mid + 1}..{mergeRange.right}]
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Array Bars */}
        {sortArray.map((val, idx) => {
          const x = startX + idx * (barWidth + gap);
          const barHeight = (val / maxVal) * 140;
          const y = 255 - barHeight;

          const isPivot = sortAlgo === 'quick' && pivotIdx === idx;
          const isComparing = comparingIdx && (comparingIdx[0] === idx || comparingIdx[1] === idx);
          const isSorted = sortedIndices.includes(idx);
          const isLeftSubArray = sortAlgo === 'merge' && mergeRange && idx >= mergeRange.left && idx <= mergeRange.mid;
          const isRightSubArray = sortAlgo === 'merge' && mergeRange && idx > mergeRange.mid && idx <= mergeRange.right;

          let fill = '#3b82f6';
          let stroke = '#60a5fa';

          if (isPivot) {
            fill = '#a855f7';
            stroke = '#c084fc';
          } else if (isComparing) {
            fill = '#f59e0b';
            stroke = '#fbbf24';
          } else if (isSorted) {
            fill = '#10b981';
            stroke = '#34d399';
          } else if (isLeftSubArray) {
            fill = '#0284c7';
            stroke = '#38bdf8';
          } else if (isRightSubArray) {
            fill = '#e11d48';
            stroke = '#f43f5e';
          }

          return (
            <g
              key={idx}
              className="sim-svg-interactive"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('.sim-viewport')?.getBoundingClientRect();
                setHoveredInfo({
                  x: rect ? e.clientX - rect.left : x,
                  y: rect ? e.clientY - rect.top : y,
                  title: `Array Element [${idx}] = ${val}`,
                  category: isPivot
                    ? 'Selected Pivot'
                    : isSorted
                    ? 'Sorted In Position'
                    : isComparing
                    ? 'Active Comparison'
                    : isLeftSubArray
                    ? 'Left Sub-Array (Divide)'
                    : isRightSubArray
                    ? 'Right Sub-Array (Divide)'
                    : 'Array Element',
                  color: stroke,
                  description:
                    sortAlgo === 'merge'
                      ? `Represents integer ${val} at index ${idx}. Merge Sort divides the array into sub-arrays and merges them in sorted order with guaranteed O(n log n) efficiency.`
                      : sortAlgo === 'quick'
                      ? `Represents integer ${val} at index ${idx}. Quick Sort chooses a pivot and partitions elements smaller and larger around it.`
                      : `Represents integer ${val} at index ${idx}. Bubble Sort repeatedly compares adjacent elements and swaps them if out of order.`,
                  stats: [
                    { label: 'Value', value: String(val) },
                    { label: 'Array Index', value: `[${idx}]` },
                    { label: 'Algorithm', value: algoLabel },
                    { label: 'Status', value: isSorted ? 'Sorted' : isComparing ? 'Comparing' : isLeftSubArray ? 'Left Sub-list' : isRightSubArray ? 'Right Sub-list' : 'Pending' },
                  ],
                });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="4"
                fill={fill}
                stroke={stroke}
                strokeWidth={isComparing || isPivot ? '2' : '1.5'}
                style={{ transition: 'all 0.12s ease' }}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {val}
              </text>
              <text
                x={x + barWidth / 2}
                y={272}
                fill="#64748b"
                fontSize="9.5"
                textAnchor="middle"
                fontFamily="monospace"
              >
                [{idx}]
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // =========================================================================
  // UNIVERSAL DYNAMIC SANDBOXED GENERATIVE UI
  // =========================================================================
  const renderCustomHtml = () => {
    let cleanCode = code.trim();
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(cleanCode);

    if (!hasHtmlTags) {
      return (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
            ⚡ Interactive Simulation Engines Ready
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Select an interactive visual engine below to launch dynamic node manipulation, live algorithmic traversal, or scientific simulations:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '520px', margin: '0 auto' }}>
            <button
              type="button"
              className="sim-btn sim-btn--primary"
              onClick={() => setActiveSimOverride('graph')}
            >
              🕸️ Graph (Dijkstra/A*)
            </button>
            <button
              type="button"
              className="sim-btn sim-btn--primary"
              onClick={() => setActiveSimOverride('hash-table')}
            >
              🗄️ Hash Table
            </button>
            <button
              type="button"
              className="sim-btn sim-btn--primary"
              onClick={() => setActiveSimOverride('stack-queue')}
            >
              🥞 Stack & Queue
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('linked-list')}
            >
              🔗 Singly Linked List
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('binary-tree')}
            >
              🌲 Binary Search Tree
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('sorting')}
            >
              📊 Merge / Quick Sort
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('nuclear-fusion')}
            >
              ⚛️ Nuclear Fusion
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('photosynthesis')}
            >
              🌿 Photosynthesis
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => setActiveSimOverride('photochemical')}
            >
              ☀️ UV Photolysis
            </button>
          </div>
        </div>
      );
    }

    const isFullDoc = cleanCode.includes('<!DOCTYPE') || cleanCode.includes('<html');

    

    const styledHtml = isFullDoc
      ? cleanCode.replace('</body>', `${INJECTED_SIMULATION_INSPECTOR_HTML}</body>`)
      : `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 12px;
              background: #141312;
              color: #faf9f5;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              overflow-x: hidden;
            }
            button {
              background: #242220;
              color: #faf9f5;
              border: 1px solid rgba(255,255,255,0.12);
              padding: 6px 14px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 12px;
              transition: all 0.15s;
            }
            button:hover { background: #33302c; border-color: rgba(217,119,87,0.4); color: #ffffff; }
            input[type="range"] { accent-color: #d97757; cursor: pointer; }
            canvas { display: block; border-radius: 8px; }
          </style>
        </head>
        <body>
          ${cleanCode}
          ${INJECTED_SIMULATION_INSPECTOR_HTML}
        </body>
      </html>
    `;

    return (
      <iframe
        className="sim-iframe"
        title="Universal Interactive Simulation Sandbox"
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
            {resolvedType === 'nuclear-fusion'
              ? 'Tokamak Plasma'
              : resolvedType === 'atomic-collision'
              ? 'Live Physics'
              : 'Interactive'}
          </span>
          <span className="sim-header__title">{defaultTitle}</span>
        </div>

        <div className="sim-header__right">
          {/* Persistence State Badge */}
          <span
            className="sim-header__badge"
            style={{
              background: 'rgba(52, 211, 153, 0.12)',
              borderColor: 'rgba(52, 211, 153, 0.35)',
              color: '#34d399',
              fontSize: '10px',
              padding: '2px 7px',
            }}
            title="Interactive modifications are auto-saved locally"
          >
            💾 Saved
          </span>

          {/* Export Actions Toolbar */}
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <button
              type="button"
              className="sim-icon-btn"
              onClick={handleExportPng}
              title="Download high-resolution PNG snapshot"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <button
              type="button"
              className="sim-icon-btn"
              onClick={handleExportSvg}
              title="Download Scalable Vector Graphic (SVG)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            <button
              type="button"
              className="sim-icon-btn"
              onClick={handleExportStudyCard}
              title="Export formatted Markdown study sheet / cheat sheet"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>
          </div>

          {exportFeedback && (
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
              {exportFeedback}
            </span>
          )}

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
          {/* Controls Bar for Nuclear Fusion */}
          {resolvedType === 'nuclear-fusion' && (
            <div className="sim-controls-bar">
              <div className="sim-slider-group">
                <label>Plasma Temp</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="30"
                  max="200"
                  step="5"
                  value={fusionTempMK}
                  onChange={handleFusionTempChange}
                />
                <span className="sim-slider-val">{fusionTempMK} MK</span>
              </div>

              <div className="sim-slider-group">
                <label>Magnetic Field</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="2.0"
                  max="9.0"
                  step="0.5"
                  value={magneticFieldT}
                  onChange={handleMagneticFieldChange}
                />
                <span className="sim-slider-val">{magneticFieldT.toFixed(1)} T</span>
              </div>

              <div className="sim-legend">
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#38bdf8' }} /> D (²H)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#22d3ee' }} /> T (³H)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#c084fc' }} /> â´He (Alpha)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#ffffff' }} /> n (14 MeV)
                </span>
              </div>
            </div>
          )}

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

          {/* Controls Bar for Photosynthesis */}
          {resolvedType === 'photosynthesis' && (
            <div className="sim-controls-bar">
              <div className="sim-slider-group">
                <label>Light Intensity</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="0.4"
                  max="3.0"
                  step="0.1"
                  value={lightIntensity}
                  onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                />
                <span className="sim-slider-val">{lightIntensity.toFixed(1)}x</span>
              </div>

              <div className="sim-slider-group">
                <label>CO₂ Level</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="200"
                  max="1000"
                  step="50"
                  value={co2Level}
                  onChange={(e) => setCo2Level(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">{co2Level} ppm</span>
              </div>

              <div className="sim-legend">
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#fde047' }} /> Photons (hν)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#38bdf8' }} /> O₂ Released
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#a855f7' }} /> C₆H₁₂O₆ Sugar
                </span>
              </div>
            </div>
          )}

          {/* Controls Bar for Photochemical Reaction */}
          {resolvedType === 'photochemical' && (
            <div className="sim-controls-bar">
              <div className="sim-slider-group">
                <label>UV Wavelength (λ)</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="200"
                  max="520"
                  step="5"
                  value={uvWavelengthNm}
                  onChange={(e) => setUvWavelengthNm(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">{uvWavelengthNm} nm</span>
              </div>

              <div className="sim-slider-group">
                <label>Laser Intensity</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="20"
                  max="100"
                  step="5"
                  value={uvFluxPct}
                  onChange={(e) => setUvFluxPct(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">{uvFluxPct}%</span>
              </div>

              <div className="sim-slider-group">
                <label>Concentration [Cl₂]</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="6"
                  max="14"
                  step="1"
                  value={reactantCount}
                  onChange={(e) => setReactantCount(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">{reactantCount} mol</span>
              </div>

              <div className="sim-legend">
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#d97757' }} /> UV Laser (hν)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#10b981' }} /> Cl₂ Reactant
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#f97316' }} /> Cl• Free Radical
                </span>
              </div>
            </div>
          )}

          {/* Controls Bar for Rocket Engine & De Laval Nozzle */}
          {resolvedType === 'rocket-engine' && (
            <div className="sim-controls-bar" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className={`sim-btn ${isEngineIgnited ? 'sim-btn--primary' : ''}`}
                style={{
                  fontWeight: 'bold',
                  background: isEngineIgnited ? 'rgba(239, 68, 68, 0.22)' : 'rgba(34, 197, 94, 0.22)',
                  borderColor: isEngineIgnited ? '#ef4444' : '#22c55e',
                  color: isEngineIgnited ? '#f87171' : '#4ade80',
                }}
                onClick={() => setIsEngineIgnited(!isEngineIgnited)}
              >
                {isEngineIgnited ? '🛑 SHUTDOWN ENGINE' : '🔥 IGNITE ENGINE'}
              </button>

              <div className="sim-slider-group">
                <label>Throttle</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="40"
                  max="100"
                  step="5"
                  value={rocketThrottlePct}
                  onChange={(e) => setRocketThrottlePct(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">{rocketThrottlePct}%</span>
              </div>

              <div className="sim-slider-group">
                <label>Altitude</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="0"
                  max="100"
                  step="5"
                  value={rocketAltitudeKm}
                  onChange={(e) => setRocketAltitudeKm(parseInt(e.target.value, 10))}
                />
                <span className="sim-slider-val">
                  {rocketAltitudeKm === 0
                    ? '0 km (Sea Level)'
                    : rocketAltitudeKm >= 100
                    ? '100+ km (Vacuum)'
                    : `${rocketAltitudeKm} km`}
                </span>
              </div>

              <div className="sim-slider-group">
                <label>O/F Ratio</label>
                <input
                  type="range"
                  className="sim-slider"
                  min="2.0"
                  max="3.2"
                  step="0.1"
                  value={rocketOfRatio}
                  onChange={(e) => setRocketOfRatio(parseFloat(e.target.value))}
                />
                <span className="sim-slider-val">{rocketOfRatio.toFixed(1)}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#b0aca2', fontWeight: 600 }}>GAS FILTER:</span>
                {(['all', 'H2O', 'CO2', 'CO', 'H2'] as const).map((spec) => (
                  <button
                    key={spec}
                    type="button"
                    className={`sim-btn ${rocketGasFilter === spec ? 'sim-btn--primary' : ''}`}
                    style={{ fontSize: '10px', padding: '3px 8px' }}
                    onClick={() => setRocketGasFilter(spec)}
                  >
                    {spec === 'all'
                      ? 'All Species'
                      : spec === 'H2O'
                      ? 'H₂O Steam (66%)'
                      : spec === 'CO2'
                      ? 'CO₂ (20%)'
                      : spec === 'CO'
                      ? 'CO (9%)'
                      : 'H₂ (5%)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Controls Bar for Sorting */}
          {(resolvedType === 'sorting' || resolvedType === 'merge-sort' || resolvedType === 'quick-sort') && (
            <div className="tree-controls-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', padding: '2px', borderRadius: '6px' }}>
                <button
                  type="button"
                  className={`sim-btn ${sortAlgo === 'merge' ? 'sim-btn--primary' : ''}`}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  onClick={() => { if (!isSorting) setSortAlgo('merge'); }}
                  disabled={isSorting}
                >
                  Merge Sort O(N log N)
                </button>
                <button
                  type="button"
                  className={`sim-btn ${sortAlgo === 'quick' ? 'sim-btn--primary' : ''}`}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  onClick={() => { if (!isSorting) setSortAlgo('quick'); }}
                  disabled={isSorting}
                >
                  Quick Sort
                </button>
                <button
                  type="button"
                  className={`sim-btn ${sortAlgo === 'bubble' ? 'sim-btn--primary' : ''}`}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  onClick={() => { if (!isSorting) setSortAlgo('bubble'); }}
                  disabled={isSorting}
                >
                  Bubble Sort O(N²)
                </button>
              </div>

              <button
                type="button"
                className="sim-btn sim-btn--primary"
                onClick={handleStartSort}
                disabled={isSorting}
              >
                {isSorting
                  ? '⏳ Sorting...'
                  : `Start ${sortAlgo === 'merge' ? 'Merge Sort' : sortAlgo === 'quick' ? 'Quick Sort' : 'Bubble Sort'}`}
              </button>
              <button
                type="button"
                className="sim-btn"
                onClick={handleShuffleSort}
                disabled={isSorting}
              >
                🔀 Shuffle Array
              </button>
              <span style={{ fontSize: '11.5px', color: '#94a3b8', marginLeft: 'auto' }}>
                Comparisons: <strong style={{ color: '#fbbf24' }}>{comparisons}</strong> | {sortAlgo === 'merge' ? 'Aux Writes' : 'Swaps'}: <strong style={{ color: '#38bdf8' }}>{swaps}</strong>
              </span>
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
                ðŸ” Search
              </button>
              <button type="button" className="sim-btn" onClick={initSampleTree}>
                ðŸ”„ Reset Sample
              </button>
              {searchStatus && (
                <span style={{ fontSize: '11.5px', color: '#38bdf8', marginLeft: 'auto' }}>
                  {searchStatus}
                </span>
              )}
            </div>
          )}

          {/* Controls Bar for Singly Linked List */}
          {resolvedType === 'linked-list' && (
            <div className="tree-controls-bar">
              <input
                type="number"
                className="tree-input"
                style={{ width: '64px' }}
                placeholder="Val..."
                value={listInputVal}
                onChange={(e) => setListInputVal(e.target.value)}
              />
              <button type="button" className="sim-btn sim-btn--primary" onClick={handlePrependHead}>
                + Prepend Head
              </button>
              <button type="button" className="sim-btn" onClick={handleAppendTail}>
                + Append Tail
              </button>
              <button type="button" className="sim-btn" onClick={handleDeleteHead}>
                Delete Head
              </button>
              <button type="button" className="sim-btn" onClick={handleSearchList}>
                Search
              </button>
              <button type="button" className="sim-btn" onClick={handleResetList}>
                Reset
              </button>
              {listStatus && (
                <span style={{ fontSize: '11.5px', color: '#38bdf8', marginLeft: 'auto' }}>
                  {listStatus}
                </span>
              )}
            </div>
          )}

          {/* Interactive Simulation Viewport */}
          <div ref={viewportRef} className="sim-viewport">
            {(resolvedType === 'atomic-collision' || resolvedType === 'nuclear-fusion') && (
              <canvas
                ref={canvasRef}
                className="sim-canvas"
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={handleCanvasMouseLeave}
              />
            )}
            {resolvedType === 'binary-tree' && renderTreeSvg()}
            {resolvedType === 'linked-list' && renderLinkedListSvg()}
            {resolvedType === 'graph' && (
              <GraphVisualizer onHover={setHoveredInfo} onStateChange={() => setHasSavedState(true)} />
            )}
            {resolvedType === 'hash-table' && (
              <HashTableVisualizer onHover={setHoveredInfo} onStateChange={() => setHasSavedState(true)} />
            )}
            {resolvedType === 'stack-queue' && (
              <StackQueueVisualizer onHover={setHoveredInfo} onStateChange={() => setHasSavedState(true)} />
            )}
            {resolvedType === 'photosynthesis' && renderPhotosynthesisSvg()}
            {resolvedType === 'photochemical' && renderPhotochemicalSvg()}
            {resolvedType === 'rocket-engine' && renderRocketEngineSvg()}
            {(resolvedType === 'sorting' || resolvedType === 'merge-sort' || resolvedType === 'quick-sort') && renderSortingSvg()}
            {resolvedType === 'custom-html' && renderCustomHtml()}
            {/* Floating Sci-Fi HUD Tooltip Overlay */}
            {hoveredInfo && (
              <div
                className="sim-hover-tooltip"
                style={{
                  left: hoveredInfo.x > 260 ? `${Math.max(12, hoveredInfo.x - 270)}px` : `${hoveredInfo.x + 20}px`,
                  top: hoveredInfo.y > 180 ? `${Math.max(12, hoveredInfo.y - 150)}px` : `${hoveredInfo.y + 16}px`,
                }}
              >
                <div className="sim-hover-tooltip__badge-row">
                  <span className="sim-hover-tooltip__about-tag">INSPECT</span>
                  <span
                    className="sim-hover-tooltip__cat-badge"
                    style={{
                      borderColor: hoveredInfo.color || '#38bdf8',
                      color: hoveredInfo.color || '#38bdf8',
                    }}
                  >
                    {hoveredInfo.category}
                  </span>
                </div>
                <div className="sim-hover-tooltip__title">{hoveredInfo.title}</div>
                <div className="sim-hover-tooltip__desc">{hoveredInfo.description}</div>
                {hoveredInfo.stats && hoveredInfo.stats.length > 0 && (
                  <div className="sim-hover-tooltip__stats">
                    {hoveredInfo.stats.map((s, idx) => (
                      <div key={idx} className="sim-hover-tooltip__stat-item">
                        <span className="sim-hover-tooltip__stat-label">{s.label}:</span>
                        <span className="sim-hover-tooltip__stat-val">{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Telemetry Bar for Nuclear Fusion */}
          {resolvedType === 'nuclear-fusion' && (
            <div className="sim-telemetry">
              <div className="sim-stats">
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Fusion Reactions</span>
                  <span className="sim-stat-value" style={{ color: '#fbbf24' }}>
                    {fusionEvents}
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Plasma Temp</span>
                  <span className="sim-stat-value">{fusionTempMK} MK</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Energy Output</span>
                  <span className="sim-stat-value" style={{ color: '#34d399' }}>
                    {energyOutputMeV.toFixed(1)} MeV
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Q-Factor</span>
                  <span className="sim-stat-value" style={{ color: fusionEvents > 5 ? '#34d399' : '#a5b4fc' }}>
                    {fusionEvents > 0 ? (1.0 + fusionEvents * 0.08).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              <div className="sim-actions">
                <button
                  type="button"
                  className="sim-btn sim-btn--primary"
                  onClick={handleInjectFuel}
                  title="Inject fresh Deuterium and Tritium fuel pellets"
                >
                  âš¡ Inject D-T Fuel
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? 'â–¶ Resume' : 'â¸ Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => initFusionPlasma(fusionTempMK)}
                >
                  ðŸ”„ Reset
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  Fusion Physics â†—
                </button>
              </div>
            </div>
          )}

          {/* Bottom Telemetry Bar for Atomic Collisions */}
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
                  {isPaused ? 'â–¶ Resume' : 'â¸ Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => initAtomicParticles(atomCount, temperature)}
                >
                  ðŸ”„ Reset
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  What happens at the atomic level â†—
                </button>
              </div>
            </div>
          )}

          {/* Bottom Telemetry Bar for Photosynthesis */}
          {resolvedType === 'photosynthesis' && (
            <div className="sim-telemetry">
              <div className="sim-stats">
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Photons Harvested</span>
                  <span className="sim-stat-value" style={{ color: '#fde047' }}>{photonsHarvested}</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">O₂ Released</span>
                  <span className="sim-stat-value" style={{ color: '#38bdf8' }}>{oxygenReleased} μmol</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Glucose (C₆H₁₂O₆)</span>
                  <span className="sim-stat-value" style={{ color: '#34d399' }}>{glucoseSynthesizedMg} mg</span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Quantum Yield</span>
                  <span className="sim-stat-value" style={{ color: '#a7f3d0' }}>82%</span>
                </div>
              </div>

              <div className="sim-actions">
                <button
                  type="button"
                  className="sim-btn sim-btn--primary"
                  onClick={() => setPhotonsHarvested((prev) => prev + 120)}
                >
                  Solar Pulse
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => {
                    setPhotonsHarvested(1420);
                    setOxygenReleased(355);
                    setGlucoseSynthesizedMg(59.2);
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  Photosynthesis Kinetics
                </button>
              </div>
            </div>
          )}

          {/* Bottom Telemetry Bar for Photochemical Reaction */}
          {resolvedType === 'photochemical' && (
            <div className="sim-telemetry">
              <div className="sim-stats">
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Photon Energy (hν)</span>
                  <span className="sim-stat-value" style={{ color: '#e08365' }}>
                    {(1239.84 / uvWavelengthNm).toFixed(2)} eV
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Radicals Formed</span>
                  <span className="sim-stat-value" style={{ color: '#faf9f5' }}>
                    {radicalsFormed} Cl•
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Photons Absorbed</span>
                  <span className="sim-stat-value" style={{ color: '#f59e0b' }}>
                    {photonsAbsorbed}
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Dissociation Status</span>
                  <span
                    className="sim-stat-value"
                    style={{ color: uvWavelengthNm <= 494 ? '#10b981' : '#f59e0b', fontSize: '13px' }}
                  >
                    {uvWavelengthNm <= 494 ? 'Active (hν ≥ D₀)' : 'Sub-Threshold'}
                  </span>
                </div>
              </div>

              <div className="sim-actions">
                <button
                  type="button"
                  className="sim-btn sim-btn--primary"
                  onClick={() => {
                    if (uvWavelengthNm <= 494) {
                      setPhotonsAbsorbed((prev) => prev + 12);
                      setRadicalsFormed((prev) => prev + 24);
                    }
                  }}
                >
                  ⚡ Pulse Laser
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => {
                    setPhotonsAbsorbed(48);
                    setRadicalsFormed(96);
                    setUvWavelengthNm(310);
                  }}
                >
                  Reset Cell
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  Photochemical Laws & Proofs
                </button>
              </div>
            </div>
          )}

          {/* Photochemical Deep Dive Drawer */}
          {showDetails && resolvedType === 'photochemical' && (
            <div className="sim-details-drawer">
              <div className="sim-details-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Governing Physical Chemistry Laws of Photochemical Reactions:
              </div>
              <div className="sim-details-content">
                <p>
                  • <strong>Grotthuss-Draper Law (First Law of Photochemistry):</strong> Only radiation absorbed by a reacting chemical system is effective in producing a photochemical transformation; transmitted or scattered light causes zero chemical change.
                </p>
                <p>
                  • <strong>Stark-Einstein Law of Photochemical Equivalence:</strong> Every primary photochemical activation process involves the absorption of exactly one quantum (photon) of light: <em>E = hν = hc / λ</em>.
                </p>
                <p>
                  • <strong>Bond Dissociation Threshold:</strong> For molecular chlorine (Cl₂), the homolytic bond dissociation energy is <em>D₀ = 242.0 kJ/mol (2.51 eV)</em>. This establishes an absolute threshold wavelength of <em>λ_max = 494 nm</em>. Wavelengths longer than 494 nm have insufficient quantum energy to break the σ-bond.
                </p>
                <p>
                  • <strong>Free Radical Chain Kinetics:</strong> Upon primary homolytic photolysis (<em>Cl₂ + hν ⟶ 2 Cl•</em>), highly reactive chlorine radicals initiate high-speed propagation with organic alkanes (<em>Cl• + CH₄ ⟶ HCl + •CH₃</em>, followed by <em>•CH₃ + Cl₂ ⟶ CH₃Cl + Cl•</em>), yielding quantum yields (Φ) of 10³ to 10⁶.
                </p>
              </div>
            </div>
          )}

          {/* Bottom Telemetry Bar for Rocket Engine */}
          {resolvedType === 'rocket-engine' && (
            <div className="sim-telemetry">
              <div className="sim-stats">
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Chamber Pressure (P_c)</span>
                  <span className="sim-stat-value" style={{ color: '#e08365' }}>
                    {chamberPressureMpa} MPa
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Net Thrust (F)</span>
                  <span className="sim-stat-value" style={{ color: '#faf9f5' }}>
                    {isEngineIgnited ? `${totalThrustKn} kN` : '0 kN'}
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Specific Impulse (I_sp)</span>
                  <span className="sim-stat-value" style={{ color: '#fbbf24' }}>
                    {isEngineIgnited ? `${ispSeconds} s` : '0 s'}
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Exit Velocity (v_e)</span>
                  <span className="sim-stat-value" style={{ color: '#38bdf8' }}>
                    {isEngineIgnited ? `Mach ${exitMach} (~3,150 m/s)` : '0 m/s'}
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Ambient Pressure</span>
                  <span className="sim-stat-value" style={{ color: '#b0aca2' }}>
                    {ambientPressureKpa} kPa
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Propellant Remaining</span>
                  <span className="sim-stat-value" style={{ color: '#faf9f5' }}>
                    {propellantMassKg} kg
                  </span>
                </div>
                <div className="sim-stat-box">
                  <span className="sim-stat-label">Gas Ejected</span>
                  <span className="sim-stat-value" style={{ color: '#38bdf8' }}>
                    {totalMoleculesEjected.toLocaleString()} pkts
                  </span>
                </div>
              </div>

              <div className="sim-actions">
                <button
                  type="button"
                  className={`sim-btn ${isEngineIgnited ? 'sim-btn--primary' : ''}`}
                  style={{
                    background: isEngineIgnited ? 'rgba(239, 68, 68, 0.22)' : 'rgba(34, 197, 94, 0.22)',
                    borderColor: isEngineIgnited ? '#ef4444' : '#22c55e',
                    color: isEngineIgnited ? '#f87171' : '#4ade80',
                    fontWeight: 600,
                  }}
                  onClick={() => setIsEngineIgnited(!isEngineIgnited)}
                >
                  {isEngineIgnited ? '🛑 Cutoff' : '🔥 Ignite'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="sim-btn"
                  onClick={() => {
                    setRocketThrottlePct(85);
                    setRocketAltitudeKm(0);
                    setRocketOfRatio(2.6);
                    setRocketGasFilter('all');
                    setIsEngineIgnited(true);
                  }}
                >
                  Reset Sea Level
                </button>
                <button
                  type="button"
                  className={`sim-btn ${showDetails ? 'sim-btn--primary' : ''}`}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  Gas Dynamics & Stoichiometry
                </button>
              </div>
            </div>
          )}

          {/* Rocket Engine Deep Dive Drawer */}
          {showDetails && resolvedType === 'rocket-engine' && (
            <div className="sim-details-drawer">
              <div className="sim-details-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Governing Gas Dynamics & Stoichiometry of Rocket Nozzle Expansion:
              </div>
              <div className="sim-details-content">
                <p>
                  • <strong>What Substance/Gas is Thrown?</strong> In a hydrocarbon/LOX rocket engine (CH₄/RP-1 + O₂), stoichiometric combustion produces: <em>Superheated H₂O Steam (66% molar fraction)</em>, <em>CO₂ Carbon Dioxide (20%)</em>, <em>CO Carbon Monoxide (9%)</em>, and <em>H₂ Hydrogen Gas (5%)</em>. High exhaust velocity (v_e ≈ 3,150 m/s) delivers upward reactive momentum (p = m · v_e).
                </p>
                <p>
                  • <strong>De Laval Nozzle Sonic Choking:</strong> Converging walls compress the subsonic gas to acoustic speed (Mach 1.0) at the throat constriction (A*). Downstream, the diverging bell contour permits supersonic expansion (M &gt; 3.4), converting thermal enthalpy into axial kinetic energy.
                </p>
                <p>
                  • <strong>Altitude Plume Morphology & Shock Diamonds:</strong> At sea level (0 km), ambient pressure (101.3 kPa) pinches the exhaust into overexpanded oblique shock diamonds. In deep space vacuum (100+ km), ambient pressure drops to zero, and exhaust gases expand outward into a wide 90° parabolic bell plume.
                </p>
                <p>
                  • <strong>Thrust Equation:</strong> Total thrust is governed by <em>F = ṁ · v_e + (P_e - P_a) · A_e</em>. In vacuum, (P_e - P_a) delivers maximum thrust and highest specific impulse (I_sp = 348 s).
                </p>
              </div>
            </div>
          )}

          {/* Fusion Deep Dive Drawer */}
          {showDetails && resolvedType === 'nuclear-fusion' && (
            <div className="sim-details-drawer">
              <div className="sim-details-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Physical Principles of D-T Nuclear Fusion:
              </div>
              <div className="sim-details-content">
                <p>
                  • <strong>Reaction Equation:</strong> ²H (Deuterium) + ³H (Tritium) ⟶ â´He (Alpha, 3.5 MeV) + n (Neutron, 14.1 MeV) + <strong>17.6 MeV</strong> total net energy.
                </p>
                <p>
                  • <strong>Coulomb Barrier & Quantum Tunneling:</strong> Both nuclei carry positive electric charges that violently repel. Only at astronomical temperatures (&gt;100 million °C) do their kinetic speeds allow quantum tunneling through the electrostatic barrier.
                </p>
                <p>
                  • <strong>Magnetic Confinement (Tokamak):</strong> Powerful toroidal magnetic fields (5–8 Tesla) exert inward Lorentz forces (<em>F = q v × B</em>), preventing the 100+ million degree plasma from touching and melting the reactor walls.
                </p>
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
                  <em>E = ½ mv²</em>) and linear momentum (<em>p = mv</em>) during collisions.
                </p>
                <p>
                  • <strong>Mass Disparity:</strong> When heavy purple atoms (4× mass) strike light green atoms (1× mass), the lighter atoms rebound with significantly greater velocity, transferring kinetic energy outward.
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
