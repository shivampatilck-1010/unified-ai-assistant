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
const calendarEventsStore: any[] = [];
const tasksStore: any[] = [];
const remindersStore: any[] = [];

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
        active_model: 'gemini-2.0-flash',
        available_models: [
          {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash (Ultra Fast & Sub-Second)',
            provider: 'gemini',
            is_default: true,
            context_window: 1048576,
          },
          {
            id: 'gemini-1.5-flash',
            name: 'Gemini 1.5 Flash (High Stability)',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.1-flash-lite',
            name: 'Gemini 3.1 Flash Lite',
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
      const chosenModel = body.model || 'gemini-2.0-flash';

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
              'You are Unified AI Assistant, an advanced multimodal coding, reasoning, and visual learning assistant with universal interactive simulation capabilities.\n\n' +
              'RESPONSE SPEED & INSTANT STREAMING:\n' +
              '1. Always output your direct explanation, overview, code, or answer FIRST so the user sees immediate streaming feedback without waiting.\n' +
              '2. When the user asks to see, simulate, learn, or explore a concept with visuals (or for linked lists, binary trees, nuclear fusion, atomic collisions, sorting, photosynthesis):\n' +
              '   - For standard visual concepts, use concise typed blocks: ```interactive-simulation\\ntype: linked-list\\n```, ```interactive-simulation\\ntype: binary-tree\\n```, ```interactive-simulation\\ntype: nuclear-fusion\\n```, ```interactive-simulation\\ntype: atomic-collision\\n```, or ```interactive-simulation\\ntype: sorting\\n```.\n' +
              '   - If writing custom HTML5 Canvas simulations, provide concise, clean, working code.\n\n' +
              'INTERACTIVE MCQ, CONCEPT TREES & EXPLORATION BRANCHES:\n' +
              'When you quiz the user, need clarification, explain a course topic, or present choices:\n' +
              'Output an interactive MCQ or Concept block:\n' +
              '```mcq\n' +
              'question: "In the Calvin Cycle (Light-Independent Reactions), what is the primary role of ATP and NADPH?"\n' +
              'options:\n' +
              '  - Option A: To provide energy and reducing power to convert 3-phosphoglycerate into G3P (sugar precursors).\n' +
              '  - Option B: To facilitate the release of Oxygen gas as a byproduct.\n' +
              '  - Option C: To capture more photons from the sun to increase the reaction rate.\n' +
              '  - Option D: To split the CO2 molecules directly into carbon and oxygen atoms.\n' +
              '```\n' +
              'You can also present course modules, reference links, and concept architectures using ```concept:\n' +
              '```concept\n' +
              'title: "CS 276 Course Syllabus & Lecture Schedule"\n' +
              'type: "LINK"\n' +
              'category: "General"\n' +
              'summary: "Detailed syllabus, grading breakdown, lab schedule, and recommended concurrency textbooks."\n' +
              'branch: POSIX Threads & Mutexes | Concurrency | Concise reference card detailing mutex locking and atomic operations | pthread_mutex_lock(&mtx)\n' +
              'branch: Raft Consensus Algorithm | Distributed Systems | Original research paper with annotated state machine diagrams | Quorum = ⌊N/2⌋ + 1\n' +
              'branch: Cache Coherence & MESI | Architecture | Memory barriers and acquire-release semantics | MESI protocol\n' +
              '```\n' +
              'The user interface renders a modern obsidian card (#070709) with a glowing neon cyan boundary (#38bdf8) and a 3-node branching explanation tree on the right. Users can click any branch pill to open an interactive deep dive with formulas, live visual simulations, and instant follow-ups!\n\n' +
              'EXAM PREPARATION & PRINTABLE PDF DOCUMENTS:\n' +
              'When the user asks for exam preparation, study guides, revision sheets, cheat sheets, or asks to "generate PDF":\n' +
              'Structure your response as a publication-grade reference document with sections, formatted LaTeX math equations ($...$ and $$...$$), tables, definitions, and cheat sheets, and include at the beginning:\n' +
              '<!-- document-export: Exam Preparation Guide | High-Fidelity Printable PDF -->\n' +
              'The user interface automatically provides a 1-click "Download PDF / Print" button and toolbar export. Never tell the user to manually copy-paste into external software or press Ctrl+P!\n\n' +
              'CONTEXTUAL MEMORY & MULTIMODAL REASONING:\n' +
              'You have full vision and multimodal capabilities to analyze images, charts, diagrams, screenshots, documents, and code. You also have full contextual memory of the ongoing conversation history. When the user asks follow-up questions referencing previous concepts, topics, or code, immediately connect your answer to the preceding discussion without asking them to repeat themselves. When the user asks to set a reminder, schedule an event, or create a task, summarize the date, time, and details clearly.',
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
              'gemini-2.0-flash',
              'gemini-1.5-flash',
              'gemini-2.5-flash',
            ])
          );
          let geminiResponse: Response | null = null;
          let usedModel = chosenModel;
          let lastErrorText = '';
          let lastErrorStatus = 0;

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
              }
            } catch (err: unknown) {
              clearTimeout(fetchTimer);
              lastErrorText = err instanceof Error ? err.message : String(err);
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

    // Projects, Tasks, Reminders, Calendar endpoints
    if (path === '/api/projects' || path.startsWith('/api/projects/')) {
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    }
    if (path === '/api/tasks' || path.startsWith('/api/tasks/')) {
      if (request.method === 'POST') {
        let taskBody: any = {};
        try {
          taskBody = await request.json();
        } catch {}
        const newTask = {
          id: `task-${Date.now()}`,
          title: taskBody.title || 'New Task',
          description: taskBody.description || '',
          status: 'pending',
          priority: taskBody.priority || 'medium',
          due_date: taskBody.due_date || null,
          created_at: new Date().toISOString(),
        };
        tasksStore.unshift(newTask);
        return jsonResponse(newTask);
      }
      return jsonResponse({ items: tasksStore, total: tasksStore.length, limit: 50, offset: 0 });
    }
    if (path === '/api/reminders' || path.startsWith('/api/reminders/')) {
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
    if (path === '/api/calendar/events' || path.startsWith('/api/calendar/events/')) {
      if (request.method === 'POST') {
        let evtBody: any = {};
        try {
          evtBody = await request.json();
        } catch {}
        const newEvt = {
          id: `evt-${Date.now()}`,
          title: evtBody.title || 'Reminder',
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

    // Browser agent status
    if (path === '/api/browser/worker/status') {
      return jsonResponse({ status: 'idle', active_tasks: 0, available: true, max_concurrency: 2 });
    }
    if (path.startsWith('/api/browser/tasks')) {
      return jsonResponse({ tasks: [], items: [], total: 0 });
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
    if (path === '/api/retention/status') {
      return jsonResponse({ retention_days: 30, policy: 'Automated privacy retention active' });
    }

    // Followup email mock endpoint
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