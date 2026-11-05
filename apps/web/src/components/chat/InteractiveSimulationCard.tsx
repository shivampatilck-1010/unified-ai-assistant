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
      declaredType === 'photosynthesis' ||
      declaredType === 'photo' ||
      lowerCode.includes('photosynthesis') ||
      lowerCode.includes('chlorophyll') ||
      lowerCode.includes('chloroplast') ||
      lowerCode.includes('photolysis')
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
        ? `Found ${val}! Path: ${path.join(' âž” ')}`
        : `${val} not found. Path: ${path.join(' âž” ')}`
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
              background: #050608;
              color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              overflow-x: hidden;
            }
            button {
              background: #1e2230;
              color: #f1f5f9;
              border: 1px solid rgba(255,255,255,0.15);
              padding: 6px 14px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 12px;
              transition: all 0.15s;
            }
            button:hover { background: #2d3345; border-color: rgba(255,255,255,0.3); }
            input[type="range"] { accent-color: #818cf8; cursor: pointer; }
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
                  <span className="sim-legend__dot" style={{ background: '#38bdf8' }} /> D (Â²H)
                </span>
                <span className="sim-legend__item">
                  <span className="sim-legend__dot" style={{ background: '#22d3ee' }} /> T (Â³H)
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
                  <span className="sim-hover-tooltip__about-tag">? ABOUT</span>
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
                  Photochemical Mechanism
                </button>
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
                  â€¢ <strong>Reaction Equation:</strong> Â²H (Deuterium) + Â³H (Tritium) âž” â´He (Alpha, 3.5 MeV) + n (Neutron, 14.1 MeV) + <strong>17.6 MeV</strong> total net energy.
                </p>
                <p>
                  â€¢ <strong>Coulomb Barrier & Quantum Tunneling:</strong> Both nuclei carry positive electric charges that violently repel. Only at astronomical temperatures (&gt;100 million &deg;C) do their kinetic speeds allow quantum tunneling through the electrostatic barrier.
                </p>
                <p>
                  â€¢ <strong>Magnetic Confinement (Tokamak):</strong> Powerful toroidal magnetic fields (5&ndash;8 Tesla) exert inward Lorentz forces (<em>F = q v &times; B</em>), preventing the 100+ million degree plasma from touching and melting the reactor walls.
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
                  â€¢ <strong>Elastic Collisions:</strong> In ideal gases, atoms conserve both total kinetic energy (
                  <em>E = &frac12; mv&sup2;</em>) and linear momentum (<em>p = mv</em>) during collisions.
                </p>
                <p>
                  â€¢ <strong>Mass Disparity:</strong> When heavy purple atoms (4&times; mass) strike light green atoms (1&times; mass), the lighter atoms rebound with significantly greater velocity, transferring kinetic energy outward.
                </p>
                <p>
                  â€¢ <strong>Temperature & Maxwell-Boltzmann:</strong> Increasing temperature directly scales the mean kinetic energy of the particles, raising collision frequency and container pressure (<em>PV = N k_B T</em>).
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
