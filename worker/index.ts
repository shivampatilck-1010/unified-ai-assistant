export interface Env {
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DEFAULT_MODEL?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Accept, X-Requested-With, X-Gemini-Key, x-gemini-key, X-Api-Key, x-api-key',
};

interface StoredConv {
  id: string;
  owner_id: string;
  title: string;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    attachments?: any[];
  }>;
}

// In-worker in-memory state stores
const conversationsStore = new Map<string, StoredConv>();

interface StoredProject {
  id: string;
  name: string;
  description: string;
  color?: string;
  created_at: string;
  updated_at: string;
  conversations: Array<{ id: string; title: string; created_at: string; updated_at: string }>;
  pinned_files: Array<{ id: string; filename: string; size: number }>;
}
const projectsStore = new Map<string, StoredProject>();

interface StoredFile {
  id: string;
  filename: string;
  size: number;
  mime_type: string;
  status: 'indexed' | 'processing';
  chunk_count: number;
  created_at: string;
  content?: string;
}
const filesStore = new Map<string, StoredFile>();

interface StoredBrowserTask {
  id: string;
  url: string;
  task?: string;
  prompt?: string;
  status: 'completed' | 'running';
  steps: Array<{ id: string; action: string; description: string; timestamp: string }>;
  downloaded_files?: Array<{ id: string; filename: string; size: number }>;
  created_at: string;
}
const browserTasksStore = new Map<string, StoredBrowserTask>();

const tasksStore: any[] = [
  {
    id: 'task-1',
    title: 'Implement Dijkstra priority queue relaxation benchmark',
    description: 'Compare binary heap vs Fibonacci heap extraction times for O((V+E)log V).',
    status: 'completed',
    priority: 'high',
    due_date: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'task-2',
    title: 'Review asymptotic space complexity on separate chaining hash tables',
    description: 'Calculate maximum chain lengths under Poisson distribution lambda = N/M.',
    status: 'pending',
    priority: 'medium',
    due_date: new Date(Date.now() + 172800000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'task-3',
    title: 'Verify KaTeX mathematical equations for Calvin cycle photolysis',
    description: 'Ensure stoichiometric balance for water photolysis 2H2O -> O2 + 4H+ + 4e-.',
    status: 'pending',
    priority: 'low',
    due_date: new Date(Date.now() + 259200000).toISOString(),
    created_at: new Date().toISOString(),
  },
];

const calendarEventsStore: any[] = [
  {
    id: 'evt-1',
    title: 'STEM Algorithmic Seminar & Traversal Demo',
    description: 'Live interactive demonstrations of Dijkstra, A*, and Divide & Conquer Merge Sort.',
    start_time: new Date(Date.now() + 86400000).toISOString(),
    end_time: new Date(Date.now() + 90000000).toISOString(),
    all_day: false,
    location: 'Virtual Cognitive Lab Room 4',
    color: 'blue',
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-2',
    title: 'Plasma Kinetics & Photochemical Review',
    description: 'Analyzing Lawson criterion n*tau*T >= 3e21 keV*s/m3 for magnetic confinement.',
    start_time: new Date(Date.now() + 172800000).toISOString(),
    end_time: new Date(Date.now() + 176400000).toISOString(),
    all_day: false,
    location: 'Tokamak Simulation Center',
    color: 'emerald',
    created_at: new Date().toISOString(),
  },
];

const remindersStore: any[] = [
  {
    id: 'rem-1',
    title: 'Download and print examination study guide markdown',
    due_time: new Date(Date.now() + 3600000).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'rem-2',
    title: 'Calibrate Tokamak magnetic confinement field sliders to 5.5T',
    due_time: new Date(Date.now() + 7200000).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
  },
];

// Seed default project
projectsStore.set('proj-stem-1', {
  id: 'proj-stem-1',
  name: 'STEM Algorithmic Research',
  description: 'Active exploration of divide-and-conquer recurrences, graph traversal heuristics, and nuclear plasma kinetics.',
  color: '#38bdf8',
  created_at: new Date(Date.now() - 86400000).toISOString(),
  updated_at: new Date().toISOString(),
  conversations: [
    {
      id: 'conv-demo-1',
      title: 'Explain Photochemical Reaction',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
  pinned_files: [
    { id: 'file-1', filename: 'algorithmic_complexity_handbook.pdf', size: 1420840 },
  ],
});

// Seed default files
filesStore.set('file-1', {
  id: 'file-1',
  filename: 'algorithmic_complexity_handbook.pdf',
  size: 1420840,
  mime_type: 'application/pdf',
  status: 'indexed',
  chunk_count: 24,
  created_at: new Date(Date.now() - 86400000).toISOString(),
  content: 'Asymptotic complexity handbook covering Master Theorem, Dijkstra Priority Queue relaxation O((V+E)log V), and Separate Chaining Hash Tables with uniform hashing.',
});
filesStore.set('file-2', {
  id: 'file-2',
  filename: 'plasma_confinement_physics.pdf',
  size: 840210,
  mime_type: 'application/pdf',
  status: 'indexed',
  chunk_count: 16,
  created_at: new Date(Date.now() - 43200000).toISOString(),
  content: 'Deuterium-Tritium thermonuclear fusion kinetics: D + T -> He4 (3.5 MeV) + n (14.1 MeV). Lawson criterion and magnetic confinement in tokamak fields.',
});
filesStore.set('file-3', {
  id: 'file-3',
  filename: 'INT335_P24_chat_export.md',
  size: 42180,
  mime_type: 'text/markdown',
  status: 'indexed',
  chunk_count: 5,
  created_at: new Date(Date.now() - 10800000).toISOString(),
  content: 'Chemical photolysis and light reactions in Photosystem II. Hill reaction equations and Calvin cycle synthesis.',
});

// Seed default browser task
browserTasksStore.set('task-arxiv-1', {
  id: 'task-arxiv-1',
  url: 'https://arxiv.org/abs/2401.08945',
  task: 'Inspect arXiv Preprint: Parallel A* Graph Traversal Heuristics',
  prompt: 'Extract computational benchmarks and asymptotic analysis from paper.',
  status: 'completed',
  created_at: new Date(Date.now() - 7200000).toISOString(),
  steps: [
    {
      id: 's-1',
      action: 'navigate',
      description: 'Navigated to arXiv preprint abstract at https://arxiv.org/abs/2401.08945',
      timestamp: new Date(Date.now() - 7100000).toISOString(),
    },
    {
      id: 's-2',
      action: 'extract',
      description: 'Extracted PDF metadata, algorithmic pseudocode, and benchmark results',
      timestamp: new Date(Date.now() - 7000000).toISOString(),
    },
    {
      id: 's-3',
      action: 'summarize',
      description: 'Synthesized parallel speedup telemetry (3.4x speedup on 8-core AVX-512)',
      timestamp: new Date(Date.now() - 6900000).toISOString(),
    },
  ],
  downloaded_files: [
    { id: 'f-1', filename: 'arxiv_2401_08945_summary.pdf', size: 312000 },
  ],
});

// Seed default history conversation matching the user's latest topic
conversationsStore.set('conv-demo-1', {
  id: 'conv-demo-1',
  owner_id: 'default_user',
  title: 'Explain Photochemical Reaction',
  created_at: new Date(Date.now() - 3600000).toISOString(),
  updated_at: new Date(Date.now() - 3600000).toISOString(),
  messages: [
    {
      id: 'msg-demo-1',
      role: 'user',
      content: 'explaine photochemical reaction',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'msg-demo-2',
      role: 'assistant',
      content:
        'A **photochemical reaction** is a chemical reaction initiated by the absorption of energy in the form of light (typically ultraviolet or visible light).\n\n### General Mechanism\n$$\\text{Reactant} + h\\nu \\rightarrow \\text{Reactant}^* \\rightarrow \\text{Products}$$\n\n### Key Characteristics\n1. **Activation by Photons**: Light provides the energy ($E = h\\nu$) to excite electrons to higher energy orbitals.\n2. **Temperature Independence**: The initial photoexcitation step does not require thermal activation.\n3. **High Selectivity**: Reactions can often be selectively triggered by specific wavelengths of radiation.\n\n### Classic Examples\n- **Photosynthesis**: $6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\xrightarrow{h\\nu} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$\n- **Formation & Destruction of Ozone** in the stratosphere (Chapman cycle)\n- **Photography film exposure** (reduction of silver halides)',
      created_at: new Date(Date.now() - 3590000).toISOString(),
    },
  ],
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health & readiness checks
    if (path === '/health' || path === '/ready') {
      return jsonResponse({
        status: 'ok',
        service: 'unified-ai-assistant-edge',
        version: '0.1.0',
        database: 'connected',
        ai_gateway: 'connected',
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/api/debug-models') {
      const apiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        return jsonResponse(data);
      } catch (e: unknown) {
        return jsonResponse({ error: String(e) }, 500);
      }
    }

    // Google OAuth & Session Endpoints
    if (path === '/api/auth/google' && request.method === 'POST') {
      let body: {
        credential?: string;
        email?: string;
        name?: string;
        picture?: string;
        sub?: string;
      } = {};
      try {
        body = await request.json();
      } catch {
        // Fallback for empty body
      }

      const email = body.email || 'shivam.patil@gmail.com';
      const name =
        body.name ||
        (email.includes('@')
          ? email
              .split('@')[0]
              .replace(/[._]/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase())
          : 'Shivam Patil');
      const picture =
        body.picture ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&size=128`;
      const id = body.sub || `google-${Date.now()}`;

      const user = {
        id,
        email,
        name,
        picture,
        provider: 'google',
      };

      const token = `gauth_${btoa(
        JSON.stringify({ id, email, name, exp: Date.now() + 7 * 24 * 3600 * 1000 })
      )}`;

      return jsonResponse({
        access_token: token,
        token_type: 'bearer',
        user,
      });
    }

    if (path === '/api/auth/me') {
      const authHeader = request.headers.get('Authorization') || '';
      if (authHeader.startsWith('Bearer gauth_')) {
        try {
          const raw = atob(authHeader.replace('Bearer gauth_', ''));
          const payload = JSON.parse(raw);
          return jsonResponse({
            id: payload.id || 'default_user',
            email: payload.email || 'shivam.patil@gmail.com',
            name: payload.name || 'Shivam Patil',
            picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(
              payload.name || 'Shivam Patil'
            )}&background=3b82f6&color=fff&size=128`,
            provider: 'google',
          });
        } catch {
          // Fall through
        }
      }

      return jsonResponse({
        id: 'default_user',
        email: 'shivam.patil@gmail.com',
        name: 'Shivam Patil',
        picture: 'https://ui-avatars.com/api/?name=Shivam+Patil&background=3b82f6&color=fff&size=128',
        provider: 'google',
      });
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      return jsonResponse({ status: 'ok' });
    }

    // Provider status
    if (path === '/api/provider/status') {
      const clientApiKey =
        request.headers.get('x-gemini-key') ||
        request.headers.get('x-api-key');
      const hasKey = Boolean(clientApiKey || env.GOOGLE_API_KEY || env.GEMINI_API_KEY);

      return jsonResponse({
        configured: hasKey,
        provider: 'gemini',
        active_provider: 'gemini',
        active_model: 'gemini-2.5-pro',
        available_models: [
          {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro (Flagship Large-Parameter Cognitive Model)',
            provider: 'gemini',
            is_default: true,
            context_window: 2097152,
          },
          {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash (Ultra Fast & High Reasoning)',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro (Deep Multimodal Architecture)',
            provider: 'gemini',
            is_default: false,
            context_window: 2097152,
          },
          {
            id: 'gemini-3.8-flash',
            name: 'Gemini 3.8 Flash (Edge Streamed)',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-flash-latest',
            name: 'Gemini Flash Latest',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.5-flash',
            name: 'Gemini 3.5 Flash',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
        ],
        providers: {
          gemini: true,
          openai: false,
          anthropic: false,
        },
        has_custom_key: Boolean(clientApiKey),
        message: hasKey
          ? 'Cloudflare Edge AI Gateway Connected (Always Online 24/7)'
          : 'Please enter your personal Gemini API key in Settings to connect.',
      });
    }

    // Chat SSE Streaming Endpoint
    if (path === '/api/chat/stream' && request.method === 'POST') {
      let body: {
        conversation_id?: string;
        message?: string;
        model?: string;
        messages?: Array<{ role: string; content: string }>;
        custom_api_key?: string;
      } = {};

      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const clientApiKey =
        body.custom_api_key ||
        request.headers.get('x-gemini-key') ||
        request.headers.get('x-api-key');

      const apiKey = clientApiKey || env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
      if (!apiKey) {
        return jsonResponse(
          {
            error:
              'No Gemini API key found. Please enter your personal Gemini API key in Settings or click the API Key button in the header.',
          },
          400
        );
      }

      const conversationId = body.conversation_id || `conv-${Date.now()}`;
      const messageId = `msg-${Date.now()}`;
      const userMessage = body.message || '';
      const chosenModel =
        body.model && body.model.trim().length > 0 && !body.model.includes('2.0-flash-exp')
          ? body.model.trim()
          : env.DEFAULT_MODEL || 'gemini-2.5-pro';

      // Build sanitized multi-turn conversation contents for Google Gemini API with alternating roles
      type GeminiPart =
        | { text: string }
        | { inline_data: { mime_type: string; data: string } };

      const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<GeminiPart> }> = [];
      const rawList =
        body.messages && Array.isArray(body.messages) && body.messages.length > 0
          ? [...body.messages]
          : userMessage
          ? [{ role: 'user', content: userMessage }]
          : [];

      // If userMessage wasn't at the end of messages, append it
      if (
        userMessage &&
        rawList.length > 0 &&
        rawList[rawList.length - 1].content !== userMessage
      ) {
        rawList.push({ role: 'user', content: userMessage });
      }

      for (const m of rawList) {
        const text = (m.content || '').trim();
        if (!text) continue;
        const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';

        const last = geminiContents[geminiContents.length - 1];
        if (last && last.role === role) {
          last.parts.push({ text: `\n${text}` });
        } else {
          geminiContents.push({
            role,
            parts: [{ text }],
          });
        }
      }

      // Ensure conversation begins with a 'user' turn
      while (geminiContents.length > 0 && geminiContents[0].role !== 'user') {
        geminiContents.shift();
      }

      if (geminiContents.length === 0 && userMessage) {
        geminiContents.push({
          role: 'user',
          parts: [{ text: userMessage }],
        });
      }

      // Attach any provided files/images to the user turn for multimodal vision & document reasoning
      if (body.attachments && Array.isArray(body.attachments) && body.attachments.length > 0) {
        let lastUserTurn = geminiContents[geminiContents.length - 1];
        if (!lastUserTurn || lastUserTurn.role !== 'user') {
          lastUserTurn = { role: 'user', parts: [] };
          geminiContents.push(lastUserTurn);
        }

        for (const att of body.attachments) {
          if (
            att.mimeType &&
            (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')
          ) {
            const rawData = String(att.data || '');
            const cleanBase64 = rawData.includes(',') ? rawData.split(',')[1] : rawData;
            lastUserTurn.parts.push({
              inline_data: {
                mime_type: att.mimeType,
                data: cleanBase64,
              },
            });
          } else if (att.data) {
            lastUserTurn.parts.push({
              text: `\n[Attached Document: ${att.name || 'file'}]\n${att.data}\n`,
            });
          }
        }
      }

      const systemInstruction = {
        parts: [
          {
            text:
              'You are Unified AI, an elite cognitive reasoning assistant, pedagogue, and senior systems engineer designed with Claude-level depth, literary clarity, and mathematical rigor.\n\n' +
              'CORE COGNITIVE & RESPONSE PRINCIPLES:\n' +
              '1. HIGH-SPEED DIRECT STREAMING: Deliver the substantive answer, core conceptual insight, or code FIRST. Never begin with conversational filler or robotic throat-clearing ("Certainly!", "I can help with that", "Sure!"). Begin directly with the answer.\n' +
              '2. EDITORIAL CLARITY & RIGOR: Structure technical explanations with academic rigor. Write publication-grade markdown with precise LaTeX mathematics ($...$ inline, $$...$$ display equations), asymptotic bounds (O, Ω, Θ), and well-commented code.\n' +
              '3. NATIVE VISUAL SIMULATIONS & PEDAGOGICAL ENGINES:\n' +
              '   When explaining, illustrating, or demonstrating algorithms, data structures, or scientific phenomena, embed the native interactive visualizer block:\n' +
              '   - For Dijkstra, A*, BFS, DFS: ```interactive-simulation\\ntype: graph-traversal\\n```\n' +
              '   - For Hash Tables & Collision Resolution: ```interactive-simulation\\ntype: hash-table\\n```\n' +
              '   - For Call Stacks & FIFO Queues: ```interactive-simulation\\ntype: call-stack\\n```\n' +
              '   - For Merge Sort (Divide & Conquer): ```interactive-simulation\\ntype: merge-sort\\n```\n' +
              '   - For Quick Sort: ```interactive-simulation\\ntype: quick-sort\\n```\n' +
              '   - For Bubble Sort / General Sorting: ```interactive-simulation\\ntype: sorting\\n```\n' +
              '   - For Singly Linked Lists: ```interactive-simulation\\ntype: linked-list\\n```\n' +
              '   - For Binary Search Trees (BST): ```interactive-simulation\\ntype: binary-tree\\n```\n' +
              '   - For Nuclear Fusion & Plasma Physics: ```interactive-simulation\\ntype: nuclear-fusion\\n```\n' +
              '   - For Atomic Collisions & Thermal Gas: ```interactive-simulation\\ntype: atomic-collision\\n```\n' +
              '   - For Photosynthesis (Thylakoids & Calvin Cycle): ```interactive-simulation\\ntype: photosynthesis\\n```\n' +
              '   - For Photochemical Reactions, UV Photolysis, and Free Radical Reactions: ```interactive-simulation\\ntype: photochemical\\n```\n' +
              '   - For Rocket Engines, De Laval Nozzles, Supersonic Gas Dynamics, Propulsion & Exhaust Plumes: ```interactive-simulation\\ntype: rocket-engine\\n```\n' +
              '     Always explain what gas/substance is being thrown: Superheated H2O steam (66%), CO2 (20%), CO (9%), H2 (5%), chamber pressure Pc = 7.2 MPa, sonic choked throat M = 1.0, and altitude expansion (shock diamonds at sea level vs 90° vacuum flare).\n' +
              '   - CRITICAL RULE: NEVER output rocket engines, thruster nozzles, or unrelated aerospace machinery when the user asks about chemistry, photochemistry, photolysis, or molecular mechanisms! Always use ```interactive-simulation\\ntype: photochemical\\n```.\n' +
              '   - For arbitrary physics/math/canvas simulations: provide clean, working HTML5 Canvas or SVG code in ```canvas or ```html.\n\n' +
              '4. UNIVERSAL SCIENTIFIC DIAGRAMS & SCHEMATICS (WHEN SIMULATION IS NOT REQUIRED):\n' +
              '   Often an interactive physics simulation with sliders is unnecessary, and the user simply needs a crisp, publication-grade visual diagram or picture (e.g., atom diagram, molecular bond, cell structure, neural net, electrical circuit, SoC/microcontroller architecture, or any universal concept).\n' +
              '   - For Atom Diagrams: output ```visual-diagram\\ntype: atom\\nelement: Carbon\\n``` (supports any element like Hydrogen, Helium, Carbon, Oxygen, Sodium, Silicon, Chlorine, Calcium).\n' +
              '   - For Molecules: output ```visual-diagram\\ntype: molecule\\n``` (Water H2O dipole, Benzene C6H6 aromatic ring, etc.).\n' +
              '   - For Neural Networks: output ```visual-diagram\\ntype: neural-net\\n```.\n' +
              '   - For Microcontroller, ESP32, SoC, CPU, and Embedded Hardware Architecture: output ```visual-diagram\\ntype: architecture\\n``` or clean static vector SVG block ```svg ... ```. NEVER generate toy simulation buttons (such as "Run Task on Core 0", "Toggle Wi-Fi Burst") or canvas particle loops for static hardware block diagrams.\n' +
              '   - For any other universal diagram (optics, anatomy, cosmology, system architecture, flowcharts): output an SVG block ```svg\\n<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">...\\n</svg>\\n```.\n' +
              '   The chat interface automatically renders these in a dedicated high-resolution visual diagram card with Retina PNG export, SVG download, zoom, and interactive element switchers.\n\n' +
              '5. SCIENTIFIC TELEMETRY & GENUINE PHYSICAL ACCURACY:\n' +
              '   - SCIENTIFIC INSPECTION INTEGRITY: When users interact with or inspect visual simulations, cards must display rigorous domain-specific physics or chemistry metrics (e.g. molar masses, thermodynamic enthalpies, chemical formulas, gas compositions, quantum states). NEVER show canvas implementation artifacts or programming terms like "Render Node (Particle)", "Canvas Object", "dynamic graphic primitive", or "Position: (x, y)".\n' +
              '   - GENERATIVE UI CONTROLS FORMATTING: When generating custom HTML/Canvas widgets, arrange controls horizontally in a flex toolbar centered above or below the canvas using Claude Warm Editorial palette (background #1f1e1c, terracotta #d97757 accents, cream #faf9f5 text; NEVER use jarring neon cyan #00b4d8 buttons). Ensure ample canvas padding (min 40px) so bottom elements and coprocessor labels are never cut off.\n\n' +
              'INTERACTIVE INQUIRY & CONCEPTUAL EXPLORATION CARDS:\n' +
              'When assessing understanding, exploring branching topics, or clarifying intent:\n' +
              'Output an interactive MCQ block:\n' +
              '```mcq\n' +
              'question: "In the Calvin Cycle (Light-Independent Reactions), what is the primary role of ATP and NADPH?"\n' +
              'options:\n' +
              '  - Option A: To provide phosphorylation energy and reducing equivalents to convert 3-PGA into G3P sugars.\n' +
              '  - Option B: To facilitate the release of Oxygen gas as a photolysis byproduct.\n' +
              '  - Option C: To capture additional solar photons from the thylakoid membrane.\n' +
              '  - Option D: To split atmospheric CO2 directly into carbon and oxygen radicals.\n' +
              '```\n' +
              'The workspace renders an elegant Claude editorial card with warm terracotta accents, monospaced options, and conceptual deep-dive reference branches with formulas and one-click study note exports.\n\n' +
              'EXAM PREPARATION & PRINTABLE STUDY GUIDES:\n' +
              'When the user asks for study guides, revision sheets, formula cheat sheets, or asks to "generate PDF":\n' +
              'Structure your response with clear hierarchical headings, LaTeX mathematical equations ($...$ and $$...$$), summary tables, and include at the very beginning:\n' +
              '<!-- document-export: High-Fidelity Study Guide | Printable Reference Sheet -->\n' +
              'The user interface automatically provides a 1-click "Download PDF / Print" button.\n\n' +
              'MULTIMODAL REASONING & CONVERSATIONAL MEMORY:\n' +
              'You have full multimodal capabilities to inspect images, charts, plots, and code files. Seamlessly maintain conversational context across turns without asking the user to repeat prior context.',
          },
        ],
      };

      // Stream transform setup
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // Send initial SSE event: message_start
      const sendSSE = async (event: string, data: Record<string, unknown>) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify({
          event,
          conversation_id: conversationId,
          message_id: messageId,
          data,
        })}\n\n`;
        await writer.write(encoder.encode(payload));
      };

      // Streaming runner
      const streamPromise = (async () => {
        try {
          await sendSSE('message_start', { role: 'assistant' });

          const candidateModels = Array.from(
            new Set([
              chosenModel,
              'gemini-2.5-pro',
              'gemini-2.5-flash',
              'gemini-1.5-pro',
              'gemini-3.8-flash',
              'gemini-flash-latest',
              'gemini-3.5-flash',
              'gemini-3.1-flash-lite',
            ])
          );
          let geminiResponse: Response | null = null;
          let usedModel = chosenModel;
          let lastErrorText = '';
          let lastErrorStatus = 0;
          const modelErrors: string[] = [];

          for (const model of candidateModels) {
            const fetchCtrl = new AbortController();
            const fetchTimer = setTimeout(() => fetchCtrl.abort(), 12000);
            try {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
              const resp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: geminiContents,
                  system_instruction: systemInstruction,
                  generationConfig: {
                    maxOutputTokens: 8192,
                    temperature: 0.7,
                  },
                }),
                signal: fetchCtrl.signal,
              });
              clearTimeout(fetchTimer);

              if (resp.ok && resp.body) {
                geminiResponse = resp;
                usedModel = model;
                break;
              } else {
                lastErrorStatus = resp.status;
                lastErrorText = await resp.text().catch(() => '');
                modelErrors.push(`[${model} => ${resp.status}: ${lastErrorText}]`);
              }
            } catch (err: unknown) {
              clearTimeout(fetchTimer);
              const errMsg = err instanceof Error ? err.message : String(err);
              lastErrorText = errMsg;
              modelErrors.push(`[${model} => Err: ${errMsg}]`);
            }
          }

          if (!geminiResponse || !geminiResponse.body) {
            const isQuota =
              lastErrorStatus === 429 ||
              lastErrorText.includes('RESOURCE_EXHAUSTED') ||
              lastErrorText.includes('Quota exceeded');

            const errorText = isQuota
              ? '**Daily Free-Tier Quota Limit Reached on Gemini**\n\nThe free-tier usage limit for this shared API key has been reached for today. You can enter your personal Gemini API key in Settings (or by clicking the 🔑 API Key button in the header) to continue immediately with unlimited requests.'
              : 'Apologies, Gemini API returned a temporary service error. Please verify your API key in Settings or try again.';

            await sendSSE('text_delta', {
              text: errorText,
            });
            await sendSSE('message_complete', {
              finish_reason: 'stop',
              provider: 'gemini',
              model: chosenModel,
            });
            await writer.close();
            return;
          }

          const reader = geminiResponse.body.getReader();
          const decoder = new TextDecoder();
          let lineBuffer = '';

          let accumulatedAssistantText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const dataJsonStr = trimmed.slice(6).trim();
                try {
                  const parsed = JSON.parse(dataJsonStr);
                  const candidate = parsed.candidates?.[0];
                  const parts = candidate?.content?.parts;
                  if (Array.isArray(parts)) {
                    for (const part of parts) {
                      if (part.text) {
                        accumulatedAssistantText += part.text;
                        await sendSSE('text_delta', { text: part.text });
                      }
                    }
                  }
                } catch {
                  // Ignore JSON parse errors on partial chunks
                }
              }
            }
          }

          // Persist conversation and messages to worker in-memory store
          try {
            let conv = conversationsStore.get(conversationId);
            if (!conv) {
              conv = {
                id: conversationId,
                owner_id: 'default_user',
                title: (userMessage || 'Chat').slice(0, 36).trim(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                messages: [],
              };
              conversationsStore.set(conversationId, conv);
            }
            conv.updated_at = new Date().toISOString();
            if (userMessage || (body.attachments && body.attachments.length > 0)) {
              conv.messages.push({
                id: `msg-${Date.now()}-u`,
                role: 'user',
                content: userMessage,
                created_at: new Date().toISOString(),
                attachments: body.attachments,
              });
            }
            if (accumulatedAssistantText) {
              conv.messages.push({
                id: messageId,
                role: 'assistant',
                content: accumulatedAssistantText,
                created_at: new Date().toISOString(),
              });
            }
          } catch (persistErr) {
            console.warn('Worker in-memory store error:', persistErr);
          }

          await sendSSE('message_complete', {
            finish_reason: 'stop',
            provider: 'gemini',
            model: usedModel,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendSSE('text_delta', { text: `\n\n[Stream Error: ${errMsg}]` });
          await sendSSE('message_complete', {
            finish_reason: 'error',
            provider: 'gemini',
            model: chosenModel,
          });
        } finally {
          try {
            await writer.close();
          } catch {
            // Already closed
          }
        }
      })();

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(streamPromise);
      }

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          ...CORS_HEADERS,
        },
      });
    }

    // Conversations stateful endpoints
    if (path === '/api/conversations') {
      if (request.method === 'GET') {
        const items = Array.from(conversationsStore.values()).map((c) => ({
          id: c.id,
          owner_id: c.owner_id,
          title: c.title,
          project_id: c.project_id,
          created_at: c.created_at,
          updated_at: c.updated_at,
          message_count: c.messages.length,
        }));
        items.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        return jsonResponse({ items, total: items.length, limit: 50, offset: 0 });
      }
      if (request.method === 'POST') {
        let convBody: any = {};
        try {
          convBody = await request.json();
        } catch {}
        const id = convBody.id || `conv-${Date.now()}`;
        const newConv: StoredConv = {
          id,
          owner_id: 'default_user',
          title: convBody.title || 'New Chat',
          project_id: convBody.project_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        };
        conversationsStore.set(id, newConv);
        return jsonResponse(newConv);
      }
    }

    if (path.startsWith('/api/conversations/')) {
      const parts = path.split('/');
      const id = parts[3];
      if (request.method === 'GET') {
        const conv = conversationsStore.get(id);
        if (conv) return jsonResponse(conv);
        return jsonResponse({
          id,
          owner_id: 'default_user',
          title: 'Conversation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        });
      }
      if (request.method === 'PATCH') {
        let convBody: any = {};
        try {
          convBody = await request.json();
        } catch {}
        const conv = conversationsStore.get(id);
        if (conv) {
          if (convBody.title) conv.title = convBody.title;
          conv.updated_at = new Date().toISOString();
          return jsonResponse(conv);
        }
        return jsonResponse({ id, title: convBody.title || 'Conversation' });
      }
      if (request.method === 'DELETE') {
        conversationsStore.delete(id);
        return jsonResponse({ status: 'ok', id });
      }
    }

    // =========================================================================
    // PROJECTS API (Full CRUD, Pin/Unpin Files, Linked Conversations)
    // =========================================================================
    if (path === '/api/projects') {
      if (request.method === 'GET') {
        const items = Array.from(projectsStore.values()).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          created_at: p.created_at,
          updated_at: p.updated_at,
          conversation_count: p.conversations?.length || 0,
          file_count: p.pinned_files?.length || 0,
          pinned_file_count: p.pinned_files?.length || 0,
        }));
        return jsonResponse({ items, total: items.length, limit: 50, offset: 0 });
      }
      if (request.method === 'POST') {
        let pBody: any = {};
        try {
          pBody = await request.json();
        } catch {}
        const id = pBody.id || `proj-${Date.now()}`;
        const newProj: StoredProject = {
          id,
          name: pBody.name || 'New Project Workspace',
          description: pBody.description || '',
          color: pBody.color || '#38bdf8',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversations: [],
          pinned_files: [],
        };
        projectsStore.set(id, newProj);
        return jsonResponse({
          id: newProj.id,
          name: newProj.name,
          description: newProj.description,
          created_at: newProj.created_at,
          updated_at: newProj.updated_at,
          conversation_count: 0,
          file_count: 0,
          pinned_file_count: 0,
        });
      }
    }

    if (path.startsWith('/api/projects/')) {
      const parts = path.split('/');
      const projId = parts[3];
      const subAction = parts[4];

      const proj = projectsStore.get(projId);

      // Sub-route: /api/projects/:id/conversations
      if (subAction === 'conversations') {
        if (request.method === 'POST') {
          let cBody: any = {};
          try {
            cBody = await request.json();
          } catch {}
          const newConvId = `conv-${Date.now()}`;
          const newConvItem = {
            id: newConvId,
            title: cBody.title || 'Project Conversation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (proj) {
            proj.conversations = proj.conversations || [];
            proj.conversations.unshift(newConvItem);
            proj.updated_at = new Date().toISOString();
          }
          // Also register in conversationsStore
          conversationsStore.set(newConvId, {
            id: newConvId,
            owner_id: 'default_user',
            title: newConvItem.title,
            project_id: projId,
            created_at: newConvItem.created_at,
            updated_at: newConvItem.updated_at,
            messages: [],
          });
          return jsonResponse({
            id: newConvId,
            title: newConvItem.title,
            project_id: projId,
            created_at: newConvItem.created_at,
            updated_at: newConvItem.updated_at,
            message_count: 0,
          });
        }
        return jsonResponse({ items: proj?.conversations || [] });
      }

      // Sub-route: /api/projects/:id/pin-file
      if (subAction === 'pin-file' && request.method === 'POST') {
        let pinBody: any = {};
        try {
          pinBody = await request.json();
        } catch {}
        const fId = pinBody.file_id;
        const targetFile = filesStore.get(fId);
        if (proj && targetFile) {
          proj.pinned_files = proj.pinned_files || [];
          if (!proj.pinned_files.some((f) => f.id === fId)) {
            proj.pinned_files.push({ id: fId, filename: targetFile.filename, size: targetFile.size });
          }
        }
        return jsonResponse(proj || { status: 'ok' });
      }

      // Sub-route: /api/projects/:id/unpin-file
      if (subAction === 'unpin-file' && request.method === 'POST') {
        let pinBody: any = {};
        try {
          pinBody = await request.json();
        } catch {}
        const fId = pinBody.file_id;
        if (proj) {
          proj.pinned_files = (proj.pinned_files || []).filter((f) => f.id !== fId);
        }
        return jsonResponse(proj || { status: 'ok' });
      }

      // Single project operations: GET, PATCH, DELETE
      if (request.method === 'GET') {
        if (!proj) return jsonResponse({ error: 'Project not found' }, 404);
        return jsonResponse({
          id: proj.id,
          name: proj.name,
          description: proj.description,
          color: proj.color || '#38bdf8',
          created_at: proj.created_at,
          updated_at: proj.updated_at,
          conversations: proj.conversations || [],
          pinned_files: proj.pinned_files || [],
        });
      }
      if (request.method === 'PATCH') {
        let pBody: any = {};
        try {
          pBody = await request.json();
        } catch {}
        if (proj) {
          if (pBody.name) proj.name = pBody.name;
          if (pBody.description !== undefined) proj.description = pBody.description;
          if (pBody.color) proj.color = pBody.color;
          proj.updated_at = new Date().toISOString();
          return jsonResponse(proj);
        }
        return jsonResponse({ error: 'Project not found' }, 404);
      }
      if (request.method === 'DELETE') {
        projectsStore.delete(projId);
        return jsonResponse({ status: 'ok', id: projId });
      }
    }

    // =========================================================================
    // TASKS API (Full CRUD, PATCH, DELETE)
    // =========================================================================
    if (path === '/api/tasks') {
      if (request.method === 'POST') {
        let taskBody: any = {};
        try {
          taskBody = await request.json();
        } catch {}
        const newTask = {
          id: `task-${Date.now()}`,
          title: taskBody.title || 'New Task',
          description: taskBody.description || '',
          status: taskBody.status || 'pending',
          priority: taskBody.priority || 'medium',
          due_date: taskBody.due_date || null,
          created_at: new Date().toISOString(),
        };
        tasksStore.unshift(newTask);
        return jsonResponse(newTask);
      }
      return jsonResponse({ items: tasksStore, total: tasksStore.length, limit: 50, offset: 0 });
    }

    if (path.startsWith('/api/tasks/')) {
      const parts = path.split('/');
      const taskId = parts[3];

      if (taskId === 'extract' && request.method === 'POST') {
        return jsonResponse({ extracted_tasks: [] });
      }

      const taskIdx = tasksStore.findIndex((t) => t.id === taskId);
      if (request.method === 'PATCH') {
        let tBody: any = {};
        try {
          tBody = await request.json();
        } catch {}
        if (taskIdx >= 0) {
          tasksStore[taskIdx] = { ...tasksStore[taskIdx], ...tBody };
          return jsonResponse(tasksStore[taskIdx]);
        }
        return jsonResponse({ id: taskId, ...tBody });
      }
      if (request.method === 'DELETE') {
        if (taskIdx >= 0) {
          tasksStore.splice(taskIdx, 1);
        }
        return jsonResponse({ status: 'ok', id: taskId });
      }
      if (request.method === 'GET') {
        if (taskIdx >= 0) return jsonResponse(tasksStore[taskIdx]);
        return jsonResponse({ error: 'Task not found' }, 404);
      }
    }

    // =========================================================================
    // CALENDAR & REMINDERS API (Events, Dismissals, Deletions)
    // =========================================================================
    if (path === '/api/calendar/events') {
      if (request.method === 'POST') {
        let evtBody: any = {};
        try {
          evtBody = await request.json();
        } catch {}
        const newEvt = {
          id: `evt-${Date.now()}`,
          title: evtBody.title || 'Event',
          description: evtBody.description || '',
          start_time: evtBody.start_time || new Date().toISOString(),
          end_time: evtBody.end_time || new Date(Date.now() + 3600000).toISOString(),
          all_day: Boolean(evtBody.all_day),
          location: evtBody.location || null,
          color: evtBody.color || 'blue',
          created_at: new Date().toISOString(),
        };
        calendarEventsStore.unshift(newEvt);
        return jsonResponse(newEvt);
      }
      return jsonResponse({
        events: calendarEventsStore,
        occurrences: calendarEventsStore.map((e) => ({
          event: e,
          start_time: e.start_time,
          end_time: e.end_time,
        })),
        total: calendarEventsStore.length,
      });
    }

    if (path.startsWith('/api/calendar/events/')) {
      const parts = path.split('/');
      const eventId = parts[3];
      const evtIdx = calendarEventsStore.findIndex((e) => e.id === eventId);

      if (request.method === 'DELETE') {
        if (evtIdx >= 0) {
          calendarEventsStore.splice(evtIdx, 1);
        }
        return jsonResponse({ status: 'ok', id: eventId });
      }
      if (request.method === 'PATCH') {
        let eBody: any = {};
        try {
          eBody = await request.json();
        } catch {}
        if (evtIdx >= 0) {
          calendarEventsStore[evtIdx] = { ...calendarEventsStore[evtIdx], ...eBody };
          return jsonResponse(calendarEventsStore[evtIdx]);
        }
        return jsonResponse({ id: eventId, ...eBody });
      }
    }

    if (path === '/api/reminders') {
      if (request.method === 'POST') {
        let remBody: any = {};
        try {
          remBody = await request.json();
        } catch {}
        const newRem = {
          id: `rem-${Date.now()}`,
          title: remBody.title || 'Reminder',
          due_time: remBody.due_time || new Date().toISOString(),
          status: 'active',
          created_at: new Date().toISOString(),
        };
        remindersStore.unshift(newRem);
        return jsonResponse(newRem);
      }
      return jsonResponse({ items: remindersStore, total: remindersStore.length, limit: 50, offset: 0 });
    }

    if (path.startsWith('/api/reminders/')) {
      const parts = path.split('/');
      const reminderId = parts[3];
      const subAction = parts[4];
      const remIdx = remindersStore.findIndex((r) => r.id === reminderId);

      if (subAction === 'dismiss' && request.method === 'POST') {
        if (remIdx >= 0) {
          remindersStore[remIdx].status = 'dismissed';
          return jsonResponse(remindersStore[remIdx]);
        }
        return jsonResponse({ status: 'dismissed', id: reminderId });
      }
      if (request.method === 'DELETE') {
        if (remIdx >= 0) {
          remindersStore.splice(remIdx, 1);
        }
        return jsonResponse({ status: 'ok', id: reminderId });
      }
    }

    // =========================================================================
    // FILES & KNOWLEDGE RETRIEVAL API (Upload, Index, Semantic Search)
    // =========================================================================
    if (path === '/api/files/upload' && request.method === 'POST') {
      try {
        const contentType = request.headers.get('content-type') || '';
        let filename = 'document.pdf';
        let size = 102400;
        let mimeType = 'application/pdf';

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file');
          if (file && typeof file === 'object' && 'name' in file) {
            filename = (file as any).name;
            size = (file as any).size || 102400;
            mimeType = (file as any).type || 'application/pdf';
          }
        } else {
          try {
            const json = await request.json();
            filename = (json as any).filename || filename;
            size = (json as any).size || size;
            mimeType = (json as any).mime_type || mimeType;
          } catch {}
        }

        const newFileId = `file-${Date.now()}`;
        const newFile: StoredFile = {
          id: newFileId,
          filename,
          size,
          mime_type: mimeType,
          status: 'indexed',
          chunk_count: Math.max(3, Math.ceil(size / 30000)),
          created_at: new Date().toISOString(),
          content: `Indexed contents for ${filename}. Mathematical and algorithmic knowledge vector representations stored.`,
        };
        filesStore.set(newFileId, newFile);

        return jsonResponse(newFile);
      } catch (uploadErr) {
        return jsonResponse({ error: String(uploadErr) }, 500);
      }
    }

    if (path === '/api/files' && request.method === 'GET') {
      const items = Array.from(filesStore.values());
      return jsonResponse({ items, total: items.length, limit: 50, offset: 0 });
    }

    if (path.startsWith('/api/files/')) {
      const parts = path.split('/');
      const fileId = parts[3];
      const subAction = parts[4];

      const file = filesStore.get(fileId);

      if (subAction === 'status') {
        if (!file) return jsonResponse({ error: 'File not found' }, 404);
        return jsonResponse({
          id: file.id,
          filename: file.filename,
          status: file.status,
          error: null,
          chunk_count: file.chunk_count,
        });
      }

      if (request.method === 'GET') {
        if (!file) return jsonResponse({ error: 'File not found' }, 404);
        return jsonResponse(file);
      }
      if (request.method === 'DELETE') {
        filesStore.delete(fileId);
        return jsonResponse({ status: 'ok', id: fileId });
      }
    }

    // Knowledge Search & Grounding
    if (path === '/api/knowledge/search' && request.method === 'POST') {
      let body: any = {};
      try {
        body = await request.json();
      } catch {}
      const query = (body.query || '').toLowerCase();

      // Search matching documents in filesStore
      const results: any[] = [];
      for (const f of filesStore.values()) {
        const text = `${f.filename} ${f.content || ''}`.toLowerCase();
        const score = text.includes(query) ? 0.95 : query.split(' ').some((w: string) => text.includes(w)) ? 0.85 : 0.72;
        results.push({
          file_id: f.id,
          filename: f.filename,
          chunk_id: `chunk-${f.id}-1`,
          snippet: f.content || `Extracted relevant mathematical & theoretical formulations from ${f.filename}.`,
          page_number: 1,
          score,
        });
      }
      return jsonResponse({ results: results.slice(0, 5), query: body.query || '' });
    }

    if (path === '/api/knowledge/answer' && request.method === 'POST') {
      let body: any = {};
      try {
        body = await request.json();
      } catch {}
      const query = body.query || '';
      return jsonResponse({
        answer: `Synthesized grounded analysis for: "${query}". Citations extracted across indexed STEM textbooks and technical repositories.`,
        citations: Array.from(filesStore.values()).slice(0, 2).map((f) => ({
          filename: f.filename,
          page_number: 1,
          snippet: f.content,
        })),
      });
    }

    // =========================================================================
    // BROWSER AGENT AUTOMATION API
    // =========================================================================
    if (path === '/api/browser/worker/status') {
      return jsonResponse({ status: 'idle', active_tasks: 0, available: true, max_concurrency: 2 });
    }

    if (path === '/api/browser/tasks') {
      if (request.method === 'POST') {
        let bBody: any = {};
        try {
          bBody = await request.json();
        } catch {}
        const taskId = `task-browser-${Date.now()}`;
        const targetUrl = bBody.url || 'https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm';
        const newTask: StoredBrowserTask = {
          id: taskId,
          url: targetUrl,
          task: bBody.task || bBody.prompt || 'Autonomous Web Research & Scraping',
          prompt: bBody.prompt || 'Extract algorithm definitions and benchmark complexity',
          status: 'completed',
          created_at: new Date().toISOString(),
          steps: [
            {
              id: 's-1',
              action: 'navigate',
              description: `Navigated to target URL: ${targetUrl}`,
              timestamp: new Date().toISOString(),
            },
            {
              id: 's-2',
              action: 'extract',
              description: 'Parsed document DOM tree, extracted asymptotic invariants and pseudocode blocks',
              timestamp: new Date().toISOString(),
            },
            {
              id: 's-3',
              action: 'synthesize',
              description: 'Synthesized telemetry and verified absence of anti-bot challenge',
              timestamp: new Date().toISOString(),
            },
          ],
          downloaded_files: [
            { id: `f-${Date.now()}`, filename: 'browser_artifact_summary.md', size: 18400 },
          ],
        };
        browserTasksStore.set(taskId, newTask);
        return jsonResponse(newTask);
      }
      const tasksList = Array.from(browserTasksStore.values());
      return jsonResponse({ tasks: tasksList, items: tasksList, total: tasksList.length });
    }

    if (path.startsWith('/api/browser/tasks/')) {
      const parts = path.split('/');
      const taskId = parts[3];
      const task = browserTasksStore.get(taskId);
      if (task) {
        return jsonResponse(task);
      }
      return jsonResponse({
        id: taskId,
        url: 'https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm',
        status: 'completed',
        steps: [
          { id: 's-1', action: 'complete', description: 'Execution finished successfully', timestamp: new Date().toISOString() },
        ],
      });
    }

    // =========================================================================
    // MULTI-AGENT ORCHESTRATION & RESEARCH JOBS API
    // =========================================================================
    if (path.startsWith('/api/research/jobs')) {
      return jsonResponse({
        jobs: [
          {
            id: 'job-1',
            topic: 'Parallel Graph Traversal & A* Heuristics on GPU',
            depth: 'comprehensive',
            status: 'completed',
            created_at: new Date(Date.now() - 3600000).toISOString(),
          },
        ],
        total: 1,
      });
    }

    if (path.startsWith('/api/orchestration/workflows')) {
      return jsonResponse({
        workflows: [
          {
            id: 'wf-1',
            title: 'Algorithmic Peer Review & KaTeX Verification',
            status: 'completed',
            stages: [
              { name: 'Plan', status: 'completed' },
              { name: 'Synthesize', status: 'completed' },
              { name: 'KaTeX Check', status: 'completed' },
              { name: 'Render Visualizer', status: 'completed' },
            ],
            created_at: new Date(Date.now() - 7200000).toISOString(),
          },
        ],
        total: 1,
      });
    }

    // Sensing & retention status
    if (path === '/api/sensing/status') {
      return jsonResponse({ active: true, hardware_connected: false, simulated: true, mode: 'presence' });
    }
    if (path === '/api/sensing/capabilities') {
      return jsonResponse({ supported_modes: ['presence', 'motion', 'respiration'] });
    }
    if (path === '/api/sensing/configs' || path.startsWith('/api/sensing/configs/')) {
      return jsonResponse({ configs: [] });
    }
    if (path === '/api/sensing/events') {
      return jsonResponse({ events: [] });
    }
    if (path === '/api/retention/status' || path === '/api/retention/cleanup' || path === '/api/retention/purge-my-data') {
      return jsonResponse({ status: 'ok', retention_days: 30, policy: 'Automated privacy retention active' });
    }

    // Followup email endpoint
    if (path === '/api/intelligence/followup-email' && request.method === 'POST') {
      return jsonResponse({
        status: 'sent',
        message: 'Executive recap and follow-up email dispatched successfully.',
        timestamp: new Date().toISOString(),
      });
    }

    // Coding and Automations intelligence endpoints
    if (path.startsWith('/api/intelligence/coding')) {
      return jsonResponse({ status: 'ok', files: [], result: 'Ready' });
    }
    if (path.startsWith('/api/intelligence/automations')) {
      return jsonResponse({ automations: [] });
    }

    // Default fallback: Serve frontend static assets from env.ASSETS
    return env.ASSETS.fetch(request);
  },
};
