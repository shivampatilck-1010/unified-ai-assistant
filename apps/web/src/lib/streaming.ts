// SSE streaming client for the chat endpoint

import type { SSEEvent, SSEEventType, ChatRequest, ChunkCitation, ErrorData } from '../types';
import {
  getStreamUrl,
  getCustomApiKey,
  getCustomGroqKey,
  getCustomOpenRouterKey,
  getAuthToken,
} from './api';

export interface StreamCallbacks {
  onMessageStart: (conversationId: string, messageId: string) => void;
  onTextDelta: (text: string) => void;
  onMessageComplete: (finishReason: string, citations?: ChunkCitation[]) => void;
  onError: (errorData: ErrorData) => void;
  onStreamError: (error: Error) => void;
}

function parseSSELines(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = text.split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventType: SSEEventType | null = null;
    let dataStr = '';

    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim() as SSEEventType;
      } else if (line.startsWith('data: ')) {
        dataStr += line.slice(6);
      } else if (line.startsWith('data:')) {
        dataStr += line.slice(5);
      }
    }

    if (eventType && dataStr) {
      try {
        const parsed = JSON.parse(dataStr) as SSEEvent;
        if (parsed.event && parsed.conversation_id && parsed.message_id) {
          events.push(parsed);
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return events;
}

export async function streamChat(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;

  try {
    const customKey = getCustomApiKey();
    const groqKey = getCustomGroqKey();
    const openRouterKey = getCustomOpenRouterKey();
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (customKey) {
      headers['X-Gemini-Key'] = customKey;
    }
    if (groqKey) {
      headers['X-Groq-Key'] = groqKey;
    }
    if (openRouterKey) {
      headers['X-OpenRouter-Key'] = openRouterKey;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    response = await fetch(getStreamUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...request,
        custom_api_key: customKey || undefined,
        groq_api_key: groqKey || undefined,
        openrouter_api_key: openRouterKey || undefined,
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onStreamError(
      err instanceof Error ? err : new Error('Failed to connect to the server')
    );
    return;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) {
        detail = errJson.error;
      }
    } catch {
      // Ignore JSON parse failure
    }
    callbacks.onStreamError(
      new Error(`Server error (${response.status}): ${detail}`)
    );
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onStreamError(new Error('Response body is not readable'));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE blocks (separated by double newlines)
      const parts = buffer.split('\n\n');
      // Keep the last incomplete part in the buffer
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.trim()) continue;

        const events = parseSSELines(part + '\n\n');
        for (const event of events) {
          switch (event.event) {
            case 'message_start':
              callbacks.onMessageStart(event.conversation_id, event.message_id);
              break;
            case 'text_delta':
              callbacks.onTextDelta((event.data as { text?: string }).text ?? '');
              break;
            case 'message_complete': {
              const compData = event.data as { finish_reason?: string; citations?: ChunkCitation[] };
              callbacks.onMessageComplete(
                compData.finish_reason ?? 'stop',
                compData.citations
              );
              break;
            }
            case 'error': {
              const errData = (event.data as unknown as ErrorData) || {};
              callbacks.onError({
                code: errData.code ?? 'UNKNOWN',
                message: errData.message ?? 'An unknown error occurred',
                category: errData.category,
                retry_after: errData.retry_after,
                routed_model: errData.routed_model,
                retryable: errData.retryable,
                provider: errData.provider,
              });
              break;
            }
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const events = parseSSELines(buffer + '\n\n');
      for (const event of events) {
        switch (event.event) {
          case 'message_start':
            callbacks.onMessageStart(event.conversation_id, event.message_id);
            break;
          case 'text_delta':
            callbacks.onTextDelta((event.data as { text?: string }).text ?? '');
            break;
          case 'message_complete': {
            const compData = event.data as { finish_reason?: string; citations?: ChunkCitation[] };
            callbacks.onMessageComplete(
              compData.finish_reason ?? 'stop',
              compData.citations
            );
            break;
          }
          case 'error': {
            const errData = (event.data as unknown as ErrorData) || {};
            callbacks.onError({
              code: errData.code ?? 'UNKNOWN',
              message: errData.message ?? 'An unknown error occurred',
              category: errData.category,
              retry_after: errData.retry_after,
              routed_model: errData.routed_model,
              retryable: errData.retryable,
              provider: errData.provider,
            });
            break;
          }
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onStreamError(
      err instanceof Error ? err : new Error('Stream reading failed')
    );
  } finally {
    reader.releaseLock();
  }
}
