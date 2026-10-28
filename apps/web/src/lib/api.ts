// API client for the Unified AI Assistant backend

import type {
  ConversationDetail,
  ConversationListResponse,
  ConversationSummary,
  HealthResponse,
  SearchResponse,
  UnifiedProviderStatusResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== 'object' ||
    data === null ||
    !('status' in data) ||
    !('service' in data) ||
    !('version' in data)
  ) {
    throw new Error('Invalid health response format');
  }

  return data as HealthResponse;
}

export async function fetchProviderStatus(signal?: AbortSignal): Promise<UnifiedProviderStatusResponse> {
  const response = await fetch(`${API_BASE}/api/provider/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Provider status check failed: ${response.status}`);
  }

  return (await response.json()) as UnifiedProviderStatusResponse;
}

// Conversation Endpoints

export async function fetchConversations(
  limit: number = 50,
  offset: number = 0,
  signal?: AbortSignal
): Promise<ConversationListResponse> {
  const response = await fetch(`${API_BASE}/api/conversations?limit=${limit}&offset=${offset}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversations: ${response.status}`);
  }

  const data = (await response.json()) as ConversationListResponse;
  return data;
}

export async function createConversation(
  title?: string,
  signal?: AbortSignal
): Promise<ConversationSummary> {
  const response = await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }

  return (await response.json()) as ConversationSummary;
}

export async function fetchConversation(
  id: string,
  signal?: AbortSignal
): Promise<ConversationDetail> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversation: ${response.status}`);
  }

  return (await response.json()) as ConversationDetail;
}

export async function renameConversation(
  id: string,
  title: string,
  signal?: AbortSignal
): Promise<ConversationSummary> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to rename conversation: ${response.status}`);
  }

  return (await response.json()) as ConversationSummary;
}

export async function deleteConversation(
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete conversation: ${response.status}`);
  }
}

export async function searchConversations(
  query: string,
  limit: number = 20,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const url = `${API_BASE}/api/conversations/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return (await response.json()) as SearchResponse;
}

export function getStreamUrl(): string {
  return `${API_BASE}/api/chat/stream`;
}

export { API_BASE };
