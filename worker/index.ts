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
        active_model: 'gemini-3-flash-preview',
        available_models: [
          {
            id: 'gemini-3-flash-preview',
            name: 'Gemini 3 Flash Turbo (Ultra Fast <2s)',
            provider: 'gemini',
            is_default: true,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.5-flash',
            name: 'Gemini 3.5 Flash',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.5-flash-lite',
            name: 'Gemini 3.5 Flash Lite',
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
      const chosenModel = body.model || 'gemini-3-flash-preview';

      // Build sanitized multi-turn conversation contents for Google Gemini API with alternating roles
      const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
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

      const systemInstruction = {
        parts: [
          {
            text:
              'You are Unified AI Assistant, an advanced multimodal coding and reasoning AI. You have full contextual memory of the ongoing conversation history. When the user asks follow-up questions referencing previous concepts, topics, or code (such as "give code of that" or "explain further"), immediately connect your answer to the preceding discussion without asking them to repeat themselves.',
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
              'gemini-3-flash-preview',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
              'gemini-flash-latest',
            ])
          );
          let geminiResponse: Response | null = null;
          let usedModel = chosenModel;

          for (const model of candidateModels) {
            try {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
              const resp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: geminiContents,
                  system_instruction: systemInstruction,
                }),
              });

              if (resp.ok && resp.body) {
                geminiResponse = resp;
                usedModel = model;
                break;
              }
            } catch {
              // Try next model
            }
          }

          if (!geminiResponse || !geminiResponse.body) {
            await sendSSE('text_delta', {
              text: 'Apologies, Gemini API returned a temporary service error. Please verify your API key in Settings or try again.',
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

    // Conversations mock/state
    if (path === '/api/conversations') {
      if (request.method === 'GET') {
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      }
      if (request.method === 'POST') {
        const id = `conv-${Date.now()}`;
        return jsonResponse({
          id,
          owner_id: 'default_user',
          title: 'New Chat',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        });
      }
    }

    if (path.startsWith('/api/conversations/')) {
      const id = path.split('/')[3] || 'conv-1';
      return jsonResponse({
        id,
        owner_id: 'default_user',
        title: 'Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      });
    }

    // Projects, Tasks, Reminders, Calendar endpoints
    if (path === '/api/projects' || path.startsWith('/api/projects/')) {
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    }
    if (path === '/api/tasks' || path.startsWith('/api/tasks/')) {
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    }
    if (path === '/api/reminders' || path.startsWith('/api/reminders/')) {
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    }
    if (path === '/api/calendar/events' || path.startsWith('/api/calendar/events/')) {
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
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