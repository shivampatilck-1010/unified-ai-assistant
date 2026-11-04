/**
 * explanationBranches.ts
 * Provides intelligent, domain-grounded explanation branch synthesis
 * for InteractiveChoiceCard and ConceptCards.
 */

export interface ExplanationBranch {
  id: string;
  title: string;
  badge?: string;
  icon?: string;
  summary: string;
  formula?: string;
  deepDive?: string;
  interactiveSimType?: 'nuclear-fusion' | 'atomic-collision' | 'binary-tree' | 'photosynthesis' | 'sorting';
  actionPrompt?: string;
}

/**
 * Infer 3 rich, contextual explanation branches from a question,
 * prompt, or concept summary.
 */
export function inferExplanationBranches(
  text: string,
  options?: string[],
  category?: string
): ExplanationBranch[] {
  const normalized = `${text} ${(options || []).join(' ')} ${category || ''}`.toLowerCase();

  // 1. Photosynthesis, Photochemical Reactions, Calvin Cycle, Chlorophyll
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
        title: 'Light Reactions (Photolysis)',
        badge: 'BIOPHYSICS',
        icon: '☀️',
        summary:
          'Photons hit Photosystem II (P680), boosting electrons to high-energy states. Water molecules are split to release Oxygen gas and pump protons into the thylakoid lumen.',
        formula: '2H₂O + 4 photons → O₂ + 4H⁺ + 4e⁻',
        deepDive:
          'Chemiosmotic proton gradient drives ATP Synthase rotor to generate ATP, while ferredoxin-NADP⁺ reductase yields high-energy NADPH.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'Explain the detailed photolysis and electron transport chain mechanism in Photosystem II.',
      },
      {
        id: 'branch-energy-flow',
        title: 'ATP & NADPH Energy Transfer',
        badge: 'BIOCHEMISTRY',
        icon: '⚡',
        summary:
          'ATP provides phosphorylation energy, and NADPH supplies reducing electrons to reduce 3-PGA into glyceraldehyde-3-phosphate (G3P) sugar building blocks.',
        formula: '3-PGA + ATP + NADPH → G3P + ADP + NADP⁺ + Pi',
        deepDive:
          'Without the light-dependent phase charging ATP and NADPH, the Calvin cycle halts because carbon cannot be chemically reduced into carbohydrates.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'Why does the Calvin cycle depend on ATP and NADPH even though it is light-independent?',
      },
      {
        id: 'branch-rubisco-fixation',
        title: 'RuBisCO & Carbon Fixation',
        badge: 'ENZYMOLOGY',
        icon: '🧬',
        summary:
          'RuBisCO enzyme captures atmospheric CO₂ and fixes it onto Ribulose-1,5-bisphosphate (RuBP), yielding unstable 6-carbon intermediates that split into 3-PGA.',
        formula: 'CO₂ + RuBP ⟶ (RuBisCO) ⟶ 2 × 3-PGA',
        deepDive:
          'Every 3 turns of the cycle yield 1 net G3P molecule exported for glucose synthesis, requiring 9 ATP and 6 NADPH total.',
        interactiveSimType: 'photosynthesis',
        actionPrompt: 'What makes RuBisCO the rate-limiting enzyme in carbon fixation, and what is photorespiration?',
      },
    ];
  }

  // 2. Nuclear Fusion, Atomic Collisions, Plasma, Stellar Physics
  if (
    normalized.includes('fusion') ||
    normalized.includes('nuclear') ||
    normalized.includes('deuterium') ||
    normalized.includes('tritium') ||
    normalized.includes('coulomb') ||
    normalized.includes('atom') ||
    normalized.includes('collision') ||
    normalized.includes('plasma')
  ) {
    return [
      {
        id: 'branch-coulomb-tunneling',
        title: 'Coulomb Barrier & Tunneling',
        badge: 'QUANTUM PHYSICS',
        icon: '⚛️',
        summary:
          'Positively charged nuclei strongly repel each other electrostatically. At ~100M °C, thermal velocities allow wavefunctions to overlap via quantum mechanical tunneling.',
        formula: 'V_Coulomb = (1 / 4πε₀) · (q₁ · q₂ / r)',
        deepDive:
          'Once nuclei penetrate within ~1 femtometer (10⁻¹⁵ m), the attractive Strong Nuclear Force overcomes Coulomb repulsion and snaps them together.',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'How does quantum tunneling enable nuclear fusion at lower temperatures than classical mechanics predicts?',
      },
      {
        id: 'branch-mass-defect',
        title: 'Mass Defect & E = mc²',
        badge: 'RELATIVITY',
        icon: '💥',
        summary:
          'The fused helium-4 nucleus plus neutron weighs strictly less than the initial deuterium + tritium rest mass. This lost mass (Δm) converts directly to kinetic energy.',
        formula: 'Q = Δm · c² = (m_D + m_T - m_He - m_n) · c² = 17.6 MeV',
        deepDive:
          '80% of released energy (14.1 MeV) is carried by the neutral neutron (heats reactor blankets), and 20% (3.5 MeV) stays with the alpha particle (plasma self-heating).',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'Calculate the exact mass defect and energy release per gram of Deuterium-Tritium fusion fuel.',
      },
      {
        id: 'branch-dt-ignition',
        title: 'D-T Reaction & Ignition',
        badge: 'REACTOR PHYSICS',
        icon: '🔥',
        summary:
          'Deuterium-Tritium has the highest reaction cross-section at achievable temperatures, making it the primary fuel for magnetic tokamaks and inertial confinement.',
        formula: '²H + ³H ⟶ ⁴He (3.5 MeV) + ¹n (14.1 MeV)',
        deepDive:
          'The Lawson Criterion defines the triple product (density · temperature · confinement time > 3 × 10²¹ keV·s/m³) needed for net energy ignition (Q > 1).',
        interactiveSimType: 'nuclear-fusion',
        actionPrompt: 'Compare magnetic confinement (ITER tokamak) vs inertial confinement (NIF laser) for D-T fusion ignition.',
      },
    ];
  }

  // 3. Binary Search Tree, Algorithms, Sorting, Data Structures
  if (
    normalized.includes('binary tree') ||
    normalized.includes('bst') ||
    normalized.includes('tree') ||
    normalized.includes('traversal') ||
    normalized.includes('search') ||
    normalized.includes('sorting') ||
    normalized.includes('node')
  ) {
    return [
      {
        id: 'branch-bst-partition',
        title: 'Binary Partition Invariant',
        badge: 'DATA STRUCTURES',
        icon: '🌲',
        summary:
          'For every node: all keys in the left subtree are strictly smaller, and all keys in the right subtree are larger. This halves the search space at each descent step.',
        formula: 'T(n) = T(n/2) + O(1) ⟹ O(log n) Search',
        deepDive:
          'When balanced (AVL or Red-Black trees), tree height is h = ⌊log₂ n⌋. Unbalanced trees degrade into an O(n) linked list under sorted insertion.',
        interactiveSimType: 'binary-tree',
        actionPrompt: 'Show step-by-step how AVL tree self-balancing rotations prevent O(n) degradation in Binary Search Trees.',
      },
      {
        id: 'branch-traversal',
        title: 'In-Order Traversal Walkthrough',
        badge: 'ALGORITHMS',
        icon: '🔍',
        summary:
          'Depth-First In-Order traversal (Left Subtree ⟶ Current Node ⟶ Right Subtree) visits and outputs keys in strictly ascending sorted order in O(n) time.',
        formula: 'Order: inOrder(node.left) → emit(node.key) → inOrder(node.right)',
        deepDive:
          'Pre-order traversal is used for serialization and copying; Post-order is used for bottom-up node deallocation and math expression evaluation.',
        interactiveSimType: 'binary-tree',
        actionPrompt: 'Walk through In-Order, Pre-Order, and Post-Order traversals with stack trace visualizations.',
      },
      {
        id: 'branch-complexity',
        title: 'Time & Space Complexity',
        badge: 'COMPLEXITY',
        icon: '📊',
        summary:
          'Search, insert, and delete run in O(h) time where h is tree height. In balanced trees, this is O(log n); worst-case degenerate trees are O(n).',
        formula: 'Average Time: O(log n) | Auxiliary Call Stack: O(h)',
        deepDive:
          'With 1,000,000 elements, a balanced BST finds any record in just ~20 comparisons (log₂ 1,000,000 ≈ 20).',
        interactiveSimType: 'binary-tree',
        actionPrompt: 'Explain how B-Trees generalize BSTs for disk and database indexing with high fan-out factors.',
      },
    ];
  }

  // 4. Systems Programming, Concurrency, POSIX, Mutex, Raft
  if (
    normalized.includes('concurrency') ||
    normalized.includes('thread') ||
    normalized.includes('mutex') ||
    normalized.includes('posix') ||
    normalized.includes('raft') ||
    normalized.includes('distributed') ||
    normalized.includes('cache')
  ) {
    return [
      {
        id: 'branch-posix-threads',
        title: 'POSIX Threads & Mutex Locks',
        badge: 'SYSTEMS',
        icon: '🔒',
        summary:
          'POSIX mutexes prevent race conditions across concurrent threads. Atomic hardware primitives (CMPXCHG) ensure mutually exclusive critical section access.',
        formula: 'pthread_mutex_lock(&mtx) ⟶ [Critical Section] ⟶ pthread_mutex_unlock(&mtx)',
        deepDive:
          'Condition variables allow worker threads to sleep without consuming CPU cycles, atomically waking up when data arrives.',
        actionPrompt: 'Explain mutex vs spinlock trade-offs and condition variable signaling patterns.',
      },
      {
        id: 'branch-raft-consensus',
        title: 'Raft Consensus & Quorums',
        badge: 'DISTRIBUTED',
        icon: '🌐',
        summary:
          'Raft breaks consensus into Leader Election, Log Replication, and Safety. A strict majority quorum (N/2 + 1) is required to commit any state change.',
        formula: 'Quorum = ⌊N / 2⌋ + 1 Nodes',
        deepDive:
          'Randomized election timeouts (150ms-300ms) prevent split-vote deadlocks during leader failure failover.',
        actionPrompt: 'How does Raft maintain strong consistency during network partitions and split-brain scenarios?',
      },
      {
        id: 'branch-memory-ordering',
        title: 'Memory Models & MESI Caches',
        badge: 'HARDWARE ARCH',
        icon: '⚡',
        summary:
          'Multicore CPUs cache memory lines in Modified, Exclusive, Shared, or Invalid states. Memory barriers enforce read/write order across cores.',
        formula: 'Acquire-Release Semantics & Memory Fences',
        deepDive:
          'Out-of-order execution and compiler reordering make memory fences mandatory for lock-free multi-threaded queues.',
        actionPrompt: 'Explain cache coherence protocols (MESI) and false sharing prevention in high-performance C++.',
      },
    ];
  }

  // 5. Default Fallback Concept Branches
  return [
    {
      id: 'branch-core-mechanism',
      title: 'Core Fundamental Mechanism',
      badge: 'FOUNDATION',
      icon: '💡',
      summary:
        'The foundational operational principles, state transitions, and step-by-step logic that govern this concept.',
      formula: 'Input State ⟶ Transformation Function ⟶ Verified Output',
      deepDive:
        'Understanding the first principles enables reasoning through edge cases, boundary conditions, and performance constraints.',
      actionPrompt: `Explain the core fundamental mechanism of: ${text.slice(0, 80)}`,
    },
    {
      id: 'branch-governing-laws',
      title: 'Underlying Scientific Laws & Math',
      badge: 'FORMULA & LAWS',
      icon: '📐',
      summary:
        'The mathematical models, formal equations, conservation laws, or algorithmic proof principles that guarantee correctness.',
      formula: 'F(x, t) = Governing Analytical Relation',
      deepDive:
        'Rigorous mathematical guarantees prevent silent runtime errors and optimize resource utilization.',
      actionPrompt: `What are the governing equations and mathematical formulations for: ${text.slice(0, 80)}`,
    },
    {
      id: 'branch-real-world-impact',
      title: 'Real-World Applications & Impact',
      badge: 'APPLICATION',
      icon: '🚀',
      summary:
        'How modern engineers, scientists, and software architects apply this knowledge in production systems and experimental labs.',
      formula: 'Theoretical Model ⟶ Industrial Engineering Implementation',
      deepDive:
        'Case studies and production battle-testing highlight practical trade-offs between speed, cost, and complexity.',
      actionPrompt: `Give real-world engineering case studies and applications of: ${text.slice(0, 80)}`,
    },
  ];
}
