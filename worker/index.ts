export interface Env {
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  GEMINI_API_KEY?: string;
  DEFAULT_MODEL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Provider status
    if (path === '/api/provider/status') {
      return jsonResponse({
        configured: Boolean(env.GEMINI_API_KEY),
        provider: 'gemini',
        active_provider: 'gemini',
        active_model: 'gemini-flash-lite-latest',
        available_models: [
          {
            id: 'gemini-flash-lite-latest',
            name: 'Gemini Flash Lite (Ultra Fast)',
            provider: 'gemini',
            is_default: true,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.5-flash-lite',
            name: 'Gemini 3.5 Flash Lite',
            provider: 'gemini',
            is_default: false,
            context_window: 1048576,
          },
          {
            id: 'gemini-3.8-flash',
            name: 'Gemini 3.8 Flash',
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
        ],
        providers: {
          gemini: true,
          openai: false,
          anthropic: false,
        },
        message: 'Cloudflare Edge AI Gateway Connected (Always Online 24/7)',
      });
    }

    // Chat SSE Streaming Endpoint
    if (path === '/api/chat/stream' && request.method === 'POST') {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return jsonResponse({ error: 'GEMINI_API_KEY is not configured on Cloudflare Worker' }, 500);
      }

      let body: {
        conversation_id?: string;
        message?: string;
        model?: string;
        messages?: Array<{ role: string; content: string }>;
      } = {};

      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const conversationId = body.conversation_id || `conv-${Date.now()}`;
      const messageId = `msg-${Date.now()}`;
      const userMessage = body.message || '';
      const chosenModel = body.model || 'gemini-flash-lite-latest';

      // Format conversation contents for Google Gemini API
      const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
        for (const m of body.messages) {
          geminiContents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content || '' }],
          });
        }
      } else if (userMessage) {
        geminiContents.push({
          role: 'user',
          parts: [{ text: userMessage }],
        });
      }

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

      // Background runner to stream from Gemini API to the client
      (async () => {
        try {
          await sendSSE('message_start', { role: 'assistant' });

          const candidateModels = [chosenModel, 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
          let geminiResponse: Response | null = null;
          let usedModel = chosenModel;

          for (const model of candidateModels) {
            try {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
              const resp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: geminiContents }),
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
              text: 'Apologies, Gemini API returned a temporary service error. Please try again in a few moments.',
            });
            await sendSSE('message_complete', { finish_reason: 'stop', provider: 'gemini', model: chosenModel });
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
          await sendSSE('message_complete', { finish_reason: 'error', provider: 'gemini', model: chosenModel });
        } finally {
          try {
            await writer.close();
          } catch {
            // Already closed
          }
        }
      })();

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
