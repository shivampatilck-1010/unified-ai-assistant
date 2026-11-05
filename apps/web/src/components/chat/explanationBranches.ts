/**
 * explanationBranches.ts
 * Provides intelligent, domain-grounded conceptual deep dives and reference branches
 * formatted with Claude-style editorial clarity and rigorous technical grounding.
 */

export interface ExplanationBranch {
  id: string;
  title: string;
  badge?: string;
  iconType?: 'compass' | 'formula' | 'application' | 'code' | 'atom' | 'database' | 'cpu' | 'layers' | 'tree';
  summary: string;
  formula?: string;
  deepDive?: string;
  interactiveSimType?: 'nuclear-fusion' | 'atomic-collision' | 'binary-tree' | 'photosynthesis' | 'sorting' | 'graph-traversal' | 'hash-table';
  actionPrompt?: string;
}

/**
 * Infer 3 rich, contextual explanation branches from a question,
 * prompt, or concept summary with domain-specific depth.
 */
export function inferExplanationBranches(
  text: string,
  options?: string[],
  category?: string
): ExplanationBranch[] {
  const normalized = `${text} ${(options || []).join(' ')} ${category || ''}`.toLowerCase();

  // 0. Astronomy, Optics, Telescopes, Mirrors vs Lenses
  if (
    normalized.includes('telescope') ||
    normalized.includes('observator') ||
    normalized.includes('mirror') ||
    normalized.includes('lens') ||
    normalized.includes('astronomic') ||
    normalized.includes('chromatic') ||
    normalized.includes('aberration') ||
    normalized.includes('refraction') ||
    normalized.includes('reflection') ||
    normalized.includes('optics') ||
    normalized.includes('james webb') ||
    normalized.includes('jwst') ||
    normalized.includes('focal')
  ) {
    return [
      {
        id: 'branch-chromatic-aberration',
        title: "Chromatic Dispersion & Snell's Law",
        badge: 'OPTICS & WAVE PHYSICS',
        iconType: 'compass',
        summary:
          'Glass lenses refract different wavelengths at different focal lengths (n(λ) dispersion), causing color fringing. Curved mirrors reflect all wavelengths at identical angles (θᵢ = θᵣ) with zero chromatic aberration.',
        formula: 'Cauchy Dispersion: n(λ) = A + B/λ² ⟹ f_blue ≠ f_red (Lenses) vs θᵢ = θᵣ (Mirrors)',
        deepDive:
          'Correcting chromatic aberration in large lenses requires complex multi-element achromatic doublets/triplets, which dramatically increase mass, optical distortion, and internal absorption.',
        actionPrompt: 'Explain chromatic aberration and why law of reflection θ_i = θ_r has zero dispersion across all wavelengths.',
      },
      {
        id: 'branch-mechanical-support',
        title: 'Gravitational Sagging & Back-Surface Support',
        badge: 'STRUCTURAL ENGINEERING',
        iconType: 'layers',
        summary:
          'Lenses can only be mechanically mounted along their perimeter rims, causing thick glass to sag under its own weight. Mirrors can be rigidly supported across their entire back surface by active pneumatic actuators.',
        formula: 'Structural Sag Deflection: δ ∝ (ρ · g · R⁴) / (E · h²)',
        deepDive:
          'The 40-inch Yerkes refractor (1897) represents the physical limit of glass lenses. Modern observatories (VLT 8.2m, JWST 6.5m, ELT 39m) utilize segmented primary mirrors with active optics correcting gravitational flexure hundreds of times per second.',
        actionPrompt: 'Detail the mechanical scaling limits of refractor telescopes vs reflector telescopes with active optics.',
      },
      {
        id: 'branch-infrared-transmission',
        title: 'Infrared Transparency & Bulk Absorption',
        badge: 'ASTROPHYSICS & SPECTROSCOPY',
        iconType: 'atom',
        summary:
          'Thick glass lenses absorb infrared and ultraviolet photons essential for deep cosmological redshift spectroscopy (z > 6). Front-surface gold/aluminum mirrors achieve >98% broadband reflectivity without transmission attenuation.',
        formula: 'Beer-Lambert Absorption: I(x) = I₀ · e^(-α(λ) · x)',
        deepDive:
          'Cosmic expansion shifts ancient starlight into the near- and mid-infrared (1–28 µm). Because glass is opaque at these wavelengths, space observatories like JWST utilize gold-coated beryllium mirrors cooled to 40 K.',
        actionPrompt: 'Why is infrared transparency critical for space telescopes studying high-redshift early galaxies?',
      },
    ];
  }

  // 1. Photosynthesis, Photochemical Reactions, Calvin Cycle
  if (
    normalized.includes('calvin') ||
    normalized.includes('photosynthesis') ||
    normalized.includes('photochemical') ||
    normalized.includes('chlorophyll') ||
    normalized.includes('photolysis') ||
    normalized.includes('rubisco') ||
    normalized.includes('thylakoid')
  ) {
    return [
      {
        id: 'branch-photolysis',
        title: 'Light Reactions & Photolysis',
        badge: 'BIOPHYSICS',
        iconType: 'atom',
        summary:
          'Photons hit Photosystem II (P680), exciting electrons to high-energy states. Water is split to release diatomic oxygen and pump protons into the thylakoid lumen.',
        formula: '2H₂O + 4 photons ⟶ O₂ + 4H⁺ + 4e⁻',
        deepDive:
          'The resulting electrochemical proton gradient (ΔpH ≈ 3.0) powers ATP Synthase rotatory catalysis, producing ATP while ferredoxin-NADP⁺ reductase yields NADPH.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'Detail the photolysis mechanism and the Z-scheme electron transport chain in Photosystem II.',
      },
      {
        id: 'branch-energy-flow',
        title: 'ATP & NADPH Energy Coupling',
        badge: 'BIOCHEMISTRY',
        iconType: 'formula',
        summary:
          'ATP provides substrate phosphorylation and NADPH supplies reducing equivalents to convert 3-PGA into glyceraldehyde-3-phosphate (G3P).',
        formula: '3-PGA + ATP + NADPH ⟶ G3P + ADP + NADP⁺ + Pᵢ',
        deepDive:
          'Without the light-dependent phase regenerating ATP and NADPH, the Calvin cycle halts because carbon skeletons cannot be chemically reduced into hexose sugars.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'Why does the Calvin cycle depend on ATP and NADPH even though it is light-independent?',
      },
      {
        id: 'branch-rubisco-fixation',
        title: 'RuBisCO Catalysis & Carbon Fixation',
        badge: 'ENZYMOLOGY',
        iconType: 'compass',
        summary:
          'RuBisCO fixes atmospheric CO₂ onto Ribulose-1,5-bisphosphate (RuBP), yielding an unstable 6-carbon enediolate intermediate that hydrolyzes into two 3-PGA molecules.',
        formula: 'CO₂ + RuBP ⟶ [6C Intermediate] ⟶ 2 × 3-PGA',
        deepDive:
          'Every 3 turns of the cycle produce 1 net exported G3P molecule, requiring 9 ATP and 6 NADPH. RuBisCO oxygenase side-activity causes photorespiration losses of up to 25%.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'Examine RuBisCO kinetics, the rate-limiting steps, and evolutionary adaptations against photorespiration.',
      },
    ];
  }

  // 2. Nuclear Fusion, Plasma Physics, Quantum Tunneling
  if (
    normalized.includes('fusion') ||
    normalized.includes('nuclear') ||
    normalized.includes('deuterium') ||
    normalized.includes('tritium') ||
    normalized.includes('coulomb') ||
    normalized.includes('plasma') ||
    normalized.includes('tokamak')
  ) {
    return [
      {
        id: 'branch-coulomb-tunneling',
        title: 'Coulomb Barrier & Gamow Tunneling',
        badge: 'QUANTUM MECHANICS',
        iconType: 'atom',
        summary:
          'Positively charged nuclei experience strong electrostatic repulsion. High thermal velocity brings wavefunctions close enough to permit quantum tunneling through the Gamow peak.',
        formula: 'P_tunnel ≈ exp(-2π · α · Z₁Z₂ · c / v)',
        deepDive:
          'At distances r < 1 fm (10⁻¹⁵ m), the attractive Strong Nuclear Force overcomes electromagnetic repulsion, causing nucleons to bind tightly into helium.',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'Explain how quantum tunneling enables thermonuclear fusion at temperatures below classical electrostatic barrier heights.',
      },
      {
        id: 'branch-mass-defect',
        title: 'Mass Defect & Energy Release',
        badge: 'RELATIVISTIC PHYSICS',
        iconType: 'formula',
        summary:
          'The fused ⁴He nucleus plus free neutron has strictly lower rest mass than initial deuterium and tritium nucleons. This mass deficit Δm transforms into kinetic energy.',
        formula: 'Q = Δm · c² = (m_D + m_T - m_He - m_n)c² = 17.59 MeV',
        deepDive:
          '80% of energy (14.1 MeV) is carried by the neutron to heat the tritium-breeding lithium blanket, while 20% (3.5 MeV) remains with the alpha particle to maintain plasma self-heating.',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'Calculate the mass deficit and specific energy density of Deuterium-Tritium fusion compared to coal and fission.',
      },
      {
        id: 'branch-lawson-criterion',
        title: 'Lawson Criterion & Confinement',
        badge: 'REACTOR PHYSICS',
        iconType: 'compass',
        summary:
          'Net fusion energy production requires the triple product of plasma density, ion temperature, and energy confinement time to exceed the Lawson ignition threshold.',
        formula: 'n · T · τ_E ≥ 3 × 10²¹ keV · s / m³ (Q ≥ 1)',
        deepDive:
          'Tokamaks utilize helical magnetic fields generated by toroidal and poloidal coils to suppress magnetohydrodynamic (MHD) instabilities and heat loss.',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'Compare magnetic confinement (ITER tokamak) vs inertial confinement (NIF laser) for achieving Lawson ignition.',
      },
    ];
  }

  // 3. Machine Learning, Neural Networks, Transformers, Attention
  if (
    normalized.includes('attention') ||
    normalized.includes('transformer') ||
    normalized.includes('neural') ||
    normalized.includes('backprop') ||
    normalized.includes('gradient') ||
    normalized.includes('deep learning') ||
    normalized.includes('llm')
  ) {
    return [
      {
        id: 'branch-scaled-dot-product',
        title: 'Scaled Dot-Product Attention',
        badge: 'ARCHITECTURE',
        iconType: 'layers',
        summary:
          'Queries and Keys compute pairwise semantic relevance affinities, which are scaled by 1/√d_k to prevent softmax gradient vanishing, then applied as weights over Values.',
        formula: 'Attention(Q, K, V) = softmax(Q · Kᵀ / √d_k) · V',
        deepDive:
          'Multi-head attention projects representations into h distinct subspaces, enabling simultaneous focus on syntax, long-range dependencies, and semantic relations.',
        actionPrompt: 'Walk through scaled dot-product attention step-by-step with matrix dimension transformations.',
      },
      {
        id: 'branch-backprop-autodiff',
        title: 'Reverse-Mode Automatic Differentiation',
        badge: 'OPTIMIZATION',
        iconType: 'formula',
        summary:
          'Gradients of the loss function with respect to weights are propagated backward through the computational graph using the multivariate chain rule.',
        formula: '∂L / ∂w_ij = (∂L / ∂y_j) · (∂y_j / ∂z_j) · x_i',
        deepDive:
          'Modern optimizers (AdamW) combine running first moments (momentum) with second moments (adaptive learning rates) and decoupled L2 weight decay.',
        actionPrompt: 'Derive backpropagation through a self-attention layer and explain gradient checkpointing.',
      },
      {
        id: 'branch-inference-kv-cache',
        title: 'KV-Caching & Autoregressive Decoding',
        badge: 'SYSTEMS ML',
        iconType: 'cpu',
        summary:
          'During autoregressive token generation, Key and Value tensors for previously generated tokens are cached in GPU SRAM/HBM to avoid O(n²) redundant recomputations.',
        formula: 'KV Cache Size = 2 · b · s · n_layers · n_heads · d_head',
        deepDive:
          'PagedAttention and FlashAttention optimize GPU memory bandwidth by tiling matrix multiplications and eliminating intermediate materialization.',
        actionPrompt: 'Analyze memory bandwidth bottlenecks during LLM decoding and how FlashAttention tiles attention computation.',
      },
    ];
  }

  // 4. Graphs, Dijkstra, A*, Shortest Paths, Trees
  if (
    normalized.includes('graph') ||
    normalized.includes('dijkstra') ||
    normalized.includes('shortest path') ||
    normalized.includes('bfs') ||
    normalized.includes('dfs') ||
    normalized.includes('a*') ||
    normalized.includes('traversal')
  ) {
    return [
      {
        id: 'branch-dijkstra-relaxation',
        title: 'Greedy Edge Relaxation & Invariant',
        badge: 'GRAPH THEORY',
        iconType: 'compass',
        summary:
          'Dijkstra maintains tentative shortest distances from the source. At each step, it extracts the minimum tentative distance node and relaxes all outgoing edges.',
        formula: 'if dist[u] + w(u, v) < dist[v] then dist[v] = dist[u] + w(u, v)',
        deepDive:
          'Using a min-priority queue (min-heap), the overall asymptotic time complexity is O((V + E) log V). With Fibonacci heaps, it achieves theoretical O(E + V log V).',
        interactiveSimType: 'graph-traversal',
        actionPrompt: 'Explain why Dijkstra fails with negative edge weights and how Bellman-Ford resolves negative cycles.',
      },
      {
        id: 'branch-a-star-heuristic',
        title: 'A* Search & Admissible Heuristics',
        badge: 'SEARCH ALGORITHMS',
        iconType: 'formula',
        summary:
          'A* prioritizes nodes by evaluation function f(n) = g(n) + h(n), where g(n) is the exact cost from start and h(n) is an admissible heuristic estimate to the goal.',
        formula: 'f(n) = g(n) + h(n), where h(n) ≤ h*(n) (Admissibility)',
        deepDive:
          'An admissible heuristic never overestimates the true cost to the goal, ensuring optimal shortest path discovery while pruning unpromising branches.',
        interactiveSimType: 'graph-traversal',
        actionPrompt: 'Demonstrate Euclidean vs Manhattan heuristic distances in 2D grid pathfinding.',
      },
      {
        id: 'branch-complexity-tradeoffs',
        title: 'Asymptotic Bounds & Space Profile',
        badge: 'COMPLEXITY',
        iconType: 'code',
        summary:
          'BFS explores level-by-level using O(V) queue space for unweighted graphs. Dijkstra adds priority ordering for non-negative weighted graphs.',
        formula: 'BFS: O(V + E) | Dijkstra: O((V + E) log V) | Space: O(V)',
        deepDive:
          'In dense graphs (E ≈ V²), matrix representations yield O(V²) which matches adjacency lists with binary heaps.',
        interactiveSimType: 'graph-traversal',
        actionPrompt: 'Compare memory constraints of bidirectional search vs unidirectional Dijkstra on large road networks.',
      },
    ];
  }

  // 5. Hash Tables, Dictionaries, Collisions
  if (
    normalized.includes('hash') ||
    normalized.includes('bucket') ||
    normalized.includes('collision') ||
    normalized.includes('load factor') ||
    normalized.includes('probing')
  ) {
    return [
      {
        id: 'branch-hash-function',
        title: 'Polynomial Hash & Uniform Distribution',
        badge: 'HASHING',
        iconType: 'database',
        summary:
          'A cryptographic or polynomial rolling hash function maps variable-length keys to uniform pseudo-random 32/64-bit integers modulo table capacity M.',
        formula: 'h(s) = (∑ s[i] · pⁱ) mod M, where p is prime (e.g., 31)',
        deepDive:
          'Uniform hashing ensures each key is equally likely to hash to any of the M slots, independent of where other keys have hashed.',
        interactiveSimType: 'hash-table',
        actionPrompt: 'Compare separate chaining vs open addressing (linear, quadratic, double hashing) under high load factors.',
      },
      {
        id: 'branch-load-factor-amortization',
        title: 'Load Factor (λ) & Amortized O(1)',
        badge: 'COMPLEXITY',
        iconType: 'formula',
        summary:
          'The load factor λ = N / M dictates collision frequency. When λ exceeds threshold (typically 0.75), resizing doubles capacity to preserve O(1) expected operations.',
        formula: 'E[Search Time] = 1 + λ / 2 (Successful Search in Chaining)',
        deepDive:
          'Table doubling takes O(N) work, but since it occurs exponentially infrequently, aggregate insertion cost is amortized O(1) per element.',
        interactiveSimType: 'hash-table',
        actionPrompt: 'Prove mathematically why hash table resizing yields O(1) amortized insertion cost.',
      },
      {
        id: 'branch-collision-resolution',
        title: 'Chaining vs Robin Hood Hashing',
        badge: 'SYSTEMS DESIGN',
        iconType: 'code',
        summary:
          'Separate chaining links nodes on heap memory addresses. Robin Hood hashing reallocates items in contiguous arrays to minimize variance in probe sequence lengths.',
        formula: 'Variance(PSL) ⟶ 0 in Robin Hood Hashing',
        deepDive:
          'Contiguous open addressing benefits from CPU L1/L2 cache locality, whereas linked list nodes cause pointer chasing cache misses.',
        interactiveSimType: 'hash-table',
        actionPrompt: 'Explain how CPU cache line architecture influences modern hash table implementations like Swiss Tables.',
      },
    ];
  }

  // 6. Sorting & Divide-and-Conquer (Merge Sort, Quick Sort)
  if (
    normalized.includes('merge sort') ||
    normalized.includes('quick sort') ||
    normalized.includes('divide and conquer') ||
    normalized.includes('sorting') ||
    normalized.includes('quicksort') ||
    normalized.includes('mergesort')
  ) {
    return [
      {
        id: 'branch-divide-conquer',
        title: 'Divide-and-Conquer Recurrence',
        badge: 'RECURSION',
        iconType: 'tree',
        summary:
          'The problem is split into independent subproblems of size n/2, solved recursively, and combined in linear O(n) auxiliary time.',
        formula: 'T(n) = 2T(n/2) + O(n) ⟹ O(n log n) by Master Theorem',
        deepDive:
          'Recursion depth is exactly ⌈log₂ n⌉ levels. At each level, merging elements takes O(n) total comparisons across all partitions.',
        interactiveSimType: 'sorting',
        actionPrompt: 'Solve the recurrence relation T(n) = 2T(n/2) + O(n) using the recursion tree method.',
      },
      {
        id: 'branch-stability-space',
        title: 'Stability & Auxiliary Space Trade-offs',
        badge: 'COMPLEXITY',
        iconType: 'code',
        summary:
          'Standard Merge Sort guarantees stable sorting but requires O(n) auxiliary buffer space. Quick Sort sorts in-place O(log n) call stack space but is unstable.',
        formula: 'Merge Sort: Space O(n) | Quick Sort: Space O(log n)',
        deepDive:
          'Stability is critical when sorting records with multiple keys (e.g., sorting by date then by transaction amount).',
        interactiveSimType: 'sorting',
        actionPrompt: 'Why does standard merge sort require O(n) extra space, and can in-place merge sort run in O(n log n) time?',
      },
      {
        id: 'branch-pivot-partitioning',
        title: 'Lomuto vs Hoare Partitioning',
        badge: 'ALGORITHMS',
        iconType: 'compass',
        summary:
          'Hoare partitioning uses two pointers starting at ends moving inward, performing on average three times fewer element swaps than Lomuto partitioning.',
        formula: 'Expected Comparisons: ~1.386 n ln n in Randomized Quick Sort',
        deepDive:
          'Selecting median-of-three or randomized pivots prevents O(n²) degradation on already sorted or reverse-sorted input arrays.',
        interactiveSimType: 'sorting',
        actionPrompt: 'Compare Lomuto vs Hoare partitioning schemes with pointer trace diagrams.',
      },
    ];
  }

  // 7. Dynamic Topic-Aware Synthesis Fallback
  // Extracts subject from text to avoid generic strings like F(x, t) = Governing Relation
  const cleanSubject = text
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['what', 'when', 'which', 'where', 'how', 'explain', 'tell', 'show'].includes(w.toLowerCase()))
    .slice(0, 4)
    .join(' ') || 'Underlying Subject';

  return [
    {
      id: 'branch-core-principles',
      title: 'First-Principles Analytical Model',
      badge: 'FOUNDATION',
      iconType: 'compass',
      summary: `The formal mechanisms, governing axioms, and state transformations defining ${cleanSubject}.`,
      formula: `System(S₀) ⟶ [Invariant Transformation] ⟶ Validated State(S₁)`,
      deepDive: `Deconstructing ${cleanSubject} to its primary invariants isolates root dependencies and reveals performance and correctness constraints.`,
      actionPrompt: `Explain the foundational first principles, state invariants, and step-by-step logic of: ${cleanSubject}.`,
    },
    {
      id: 'branch-formal-relationships',
      title: 'Formal Bounds & Governing Relations',
      badge: 'FORMULATION',
      iconType: 'formula',
      summary: `Mathematical formulations, asymptotic bounds, and quantitative conservation relations governing ${cleanSubject}.`,
      formula: `Complexity / Balance: T(n) ∈ O(f(n)) ⟵ Bound Invariants`,
      deepDive: `Formal proofs and rigorous mathematical modeling protect against degenerate edge conditions and define scaling limits under load.`,
      actionPrompt: `What are the governing mathematical relations, equations, or formal asymptotic bounds for: ${cleanSubject}?`,
    },
    {
      id: 'branch-applied-systems',
      title: 'Production Architecture & Implementation',
      badge: 'APPLICATION',
      iconType: 'application',
      summary: `How modern software engineers, scientists, and researchers implement ${cleanSubject} in real-world production environments.`,
      formula: `Specification ⟶ Architectural Pipeline ⟶ Production Deployment`,
      deepDive: `Industrial case studies demonstrate practical engineering trade-offs between latency, maintainability, and resource utilization.`,
      actionPrompt: `Give concrete real-world engineering case studies, architectures, and implementation patterns for: ${cleanSubject}.`,
    },
  ];
}
