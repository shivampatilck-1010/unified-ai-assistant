// API client for the Unified AI Assistant backend

import type { HealthResponse, ProviderConfigStatus } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, {
    signal,
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  // Validate the response shape
  if (
    typeof data !== 'object' ||
    data === null ||
    !('status' in data) ||
    !('service' in data) ||
    !('version' in data) ||
    !('timestamp' in data)
  ) {
    throw new Error('Invalid health response format');
  }

  return data as HealthResponse;
}

export async function fetchProviderStatus(signal?: AbortSignal): Promise<ProviderConfigStatus> {
  const response = await fetch(`${API_BASE}/api/provider/status`, {
    signal,
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Provider status check failed: ${response.status}`);
  }

  return (await response.json()) as ProviderConfigStatus;
}

export function getStreamUrl(): string {
  return `${API_BASE}/api/chat/stream`;
}

export { API_BASE };
