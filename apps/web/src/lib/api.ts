// API client for the Unified AI Assistant backend

import type {
  BaselineCalibrationResult,
  BrowserTask,
  BrowserTaskEvent,
  CalendarEvent,
  CalendarEventCreatePayload,
  CalendarEventsQueryResponse,
  CalendarEventUpdatePayload,
  CalibrationProfile,
  ConversationDetail,
  ConversationListResponse,
  ConversationSummary,
  Esp32HardwareStatus,
  ExtractRequest,
  ExtractResponse,
  FileDetailResponse,
  FileListResponse,
  FileMetadata,
  FileStatusResponse,
  HealthResponse,
  ProjectCreateInput,
  ProjectDetail,
  ProjectListResponse,
  ProjectSummary,
  ProjectUpdateInput,
  KnowledgeAnswerRequest,
  KnowledgeAnswerResponse,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  Reminder,
  ReminderCreatePayload,
  ReminderListResponse,
  RetentionStatusResponse,
  RetentionCleanupResponse,
  RetentionPurgeResponse,
  ResearchJob,
  ResearchJobCreate,
  ResearchJobDetailResponse,
  ResearchJobListResponse,
  ResearchReport,
  ResearchSource,
  SearchResponse,
  SensingCapabilitiesResponse,
  SensingEvent,
  SensingEventListResponse,
  SensingOccupancySummary,
  SensingPurgeResponse,
  SensorConfig,
  SensorConfigCreate,
  SensorConfigUpdate,
  SimulationControlResponse,
  Task,
  TaskCreatePayload,
  TaskListResponse,
  TaskUpdatePayload,
  UnifiedProviderStatusResponse,
  WifiSensingAudit,
  WifiSensingStatusResponse,
  WorkerStatus,
  Workflow,
  WorkflowApproveRequest,
  WorkflowCancelRequest,
  WorkflowClarifyRequest,
  WorkflowConfirmStepRequest,
  WorkflowCreateRequest,
  WorkflowEvent,
  WorkflowListResponse,
  WorkflowPlan,
} from '../types';

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('unified_ai_api_base');
    if (custom && custom.trim()) {
      const cleaned = custom.trim().replace(/\/+$/, '');
      // Automatically purge ephemeral/expired trycloudflare.com tunnels from local storage
      if (cleaned.includes('.trycloudflare.com')) {
        localStorage.removeItem('unified_ai_api_base');
      } else {
        return cleaned;
      }
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8000';
    }
    return window.location.origin;
  }
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');
  return raw.replace(/\/+$/, '');
}

export function setApiBase(url: string | null): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('unified_ai_api_base', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('unified_ai_api_base');
    }
  }
}

export function getCustomApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem('unified_ai_custom_gemini_key');
  return key && key.trim() ? key.trim() : null;
}

export function setCustomApiKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('unified_ai_custom_gemini_key', key.trim());
  } else {
    localStorage.removeItem('unified_ai_custom_gemini_key');
  }
}

export function getCustomGroqKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem('unified_ai_custom_groq_key');
  return key && key.trim() ? key.trim() : null;
}

export function setCustomGroqKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('unified_ai_custom_groq_key', key.trim());
  } else {
    localStorage.removeItem('unified_ai_custom_groq_key');
  }
}

export function getCustomOpenRouterKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem('unified_ai_custom_openrouter_key');
  return key && key.trim() ? key.trim() : null;
}

export function setCustomOpenRouterKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('unified_ai_custom_openrouter_key', key.trim());
  } else {
    localStorage.removeItem('unified_ai_custom_openrouter_key');
  }
}

export function getCustomOpenAIKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem('unified_ai_custom_openai_key');
  return key && key.trim() ? key.trim() : null;
}

export function setCustomOpenAIKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('unified_ai_custom_openai_key', key.trim());
  } else {
    localStorage.removeItem('unified_ai_custom_openai_key');
  }
}

export function getCustomAnthropicKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem('unified_ai_custom_anthropic_key');
  return key && key.trim() ? key.trim() : null;
}

export function setCustomAnthropicKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('unified_ai_custom_anthropic_key', key.trim());
  } else {
    localStorage.removeItem('unified_ai_custom_anthropic_key');
  }
}

export async function validateGeminiApiKey(
  key: string
): Promise<{ valid: boolean; message: string; models?: string[] }> {
  if (!key || !key.trim()) {
    return { valid: false, message: 'Please provide an API key.' };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`
    );
    if (!res.ok) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        return {
          valid: false,
          message: errJson.error?.message || `Google API rejected the key (HTTP ${res.status})`,
        };
      } catch {
        return { valid: false, message: `Google API rejected the key (HTTP ${res.status})` };
      }
    }
    const data = await res.json();
    const modelNames: string[] = Array.isArray(data.models)
      ? data.models.map((m: { name?: string }) => (m.name || '').replace('models/', '')).filter(Boolean)
      : [];
    return {
      valid: true,
      message: 'API key successfully validated with Google Generative AI!',
      models: modelNames.slice(0, 5),
    };
  } catch (err) {
    return {
      valid: false,
      message: err instanceof Error ? err.message : 'Network error testing API key',
    };
  }
}

const API_BASE = {
  toString: () => getApiBase(),
};

function buildUrl(path: string): URL {
  const base = getApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base) {
    return new URL(`${base}${normalizedPath}`);
  }
  const fallback = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  return new URL(normalizedPath, fallback);
}

let currentAuthToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('unified_ai_auth_token') : null;

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('unified_ai_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('unified_ai_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('unified_ai_user');
  }
}

export function setAuthToken(token: string | null): void {
  currentAuthToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('unified_ai_auth_token', token);
    } else {
      localStorage.removeItem('unified_ai_auth_token');
    }
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('unified_ai_auth_token');
    if (stored) return stored;
  }
  return currentAuthToken;
}

export async function loginWithGoogle(payload: {
  credential: string;
}): Promise<{ access_token: string; token_type: string; user: UserProfile }> {
  const url = buildUrl('/api/auth/google');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Google sign-in failed (${response.status}): ${await response.text()}`);
  }
  const data = await safeParseJson<{ access_token: string; token_type: string; user: UserProfile }>(response);
  setAuthToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const url = buildUrl('/api/auth/me');
  const response = await fetch(url.toString(), {
    headers: getBaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch current user profile: ${response.status}`);
  }
  const user = await safeParseJson<UserProfile>(response);
  setStoredUser(user);
  return user;
}

export async function logoutUser(): Promise<void> {
  try {
    const url = buildUrl('/api/auth/logout');
    await fetch(url.toString(), {
      method: 'POST',
      headers: getBaseHeaders(),
    });
  } catch {
    // Continue with client-side cleanup
  }
  setAuthToken(null);
  setStoredUser(null);
}

export interface FollowupEmailPayload {
  recipient_email: string;
  subject?: string;
  custom_notes?: string;
  include_transcript?: boolean;
}

export interface FollowupEmailResult {
  status: string;
  delivered: boolean;
  delivery_mode: string;
  recipient: string;
  subject: string;
  summary_points_count: number;
  files_referenced: string[];
  html_preview_url?: string;
  message: string;
}

export async function sendFollowupEmail(
  conversationId: string,
  payload: FollowupEmailPayload
): Promise<FollowupEmailResult> {
  const url = buildUrl(`/api/conversations/${conversationId}/followup-email`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send follow-up email (${response.status}): ${errorText}`);
  }
  return safeParseJson<FollowupEmailResult>(response);
}

export function getBaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const customKey = getCustomApiKey();
  const groqKey = getCustomGroqKey();
  const openRouterKey = getCustomOpenRouterKey();
  const openAIKey = getCustomOpenAIKey();
  const anthropicKey = getCustomAnthropicKey();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (customKey) {
    headers['X-Gemini-Key'] = customKey;
  }
  if (groqKey) {
    headers['X-Groq-Key'] = groqKey;
  }
  if (openRouterKey) {
    headers['X-OpenRouter-Key'] = openRouterKey;
  }
  if (openAIKey) {
    headers['X-OpenAI-Key'] = openAIKey;
  }
  if (anthropicKey) {
    headers['X-Anthropic-Key'] = anthropicKey;
  }
  return headers;
}

export async function safeParseJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (
    trimmed.startsWith('<') ||
    trimmed.includes('<!DOCTYPE') ||
    trimmed.includes('<html') ||
    trimmed.includes('Error 1033')
  ) {
    throw new Error(
      `Backend tunnel unreachable or returned HTML (${response.status} ${response.statusText}). Please check that the backend tunnel is running or update endpoint in Settings.`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status} ${response.statusText}): ${trimmed.slice(0, 100)}`);
    }
    throw new Error(`Failed to parse backend response as JSON: ${trimmed.slice(0, 100)}`);
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await safeParseJson(response);

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

export interface ReadinessResponse {
  status: string;
  service: string;
  database: string;
  model_gateway: {
    default_provider?: string;
    configured_providers: string[];
  };
  browser_worker: {
    available: boolean;
    worker_id?: string;
    max_concurrency?: number;
  };
  scheduler: string;
  timestamp: string;
}

export async function fetchReadiness(signal?: AbortSignal): Promise<ReadinessResponse> {
  const response = await fetch(`${API_BASE}/ready`, {
    signal,
    headers: getBaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Readiness check failed with status: ${response.status}`);
  }

  return safeParseJson<ReadinessResponse>(response);
}

export async function fetchProviderStatus(signal?: AbortSignal): Promise<UnifiedProviderStatusResponse> {
  const response = await fetch(`${API_BASE}/api/provider/status`, {
    signal,
    headers: getBaseHeaders(),
  });

  if (response.status === 401) {
    throw new Error('Authentication required (401 Unauthorized)');
  }

  if (!response.ok) {
    throw new Error(`Provider status check failed: ${response.status}`);
  }

  return safeParseJson<UnifiedProviderStatusResponse>(response);
}

// Conversation Endpoints

export async function fetchConversations(
  limit: number = 50,
  offset: number = 0,
  projectId?: string | null,
  signal?: AbortSignal
): Promise<ConversationListResponse> {
  const url = new URL(`${API_BASE}/api/conversations`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (projectId) {
    url.searchParams.set('project_id', projectId);
  }
  const response = await fetch(url.toString(), {
    signal,
    headers: getBaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversations: ${response.status}`);
  }

  return safeParseJson<ConversationListResponse>(response);
}

export async function createConversation(
  title?: string,
  projectId?: string | null,
  signal?: AbortSignal
): Promise<ConversationSummary> {
  const payload: Record<string, unknown> = {};
  if (title) payload.title = title;
  if (projectId) payload.project_id = projectId;

  const response = await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }

  return safeParseJson<ConversationSummary>(response);
}

export async function fetchConversation(
  id: string,
  signal?: AbortSignal
): Promise<ConversationDetail> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    signal,
    headers: getBaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversation: ${response.status}`);
  }

  return safeParseJson<ConversationDetail>(response);
}

export async function renameConversation(
  id: string,
  title: string,
  signal?: AbortSignal
): Promise<ConversationSummary> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    signal,
    headers: getBaseHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to rename conversation: ${response.status}`);
  }

  return safeParseJson<ConversationSummary>(response);
}

export async function deleteConversation(
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
    headers: getBaseHeaders(),
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
    headers: getBaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return safeParseJson<SearchResponse>(response);
}

// Project & Workspace Endpoints (Phase 2)

export async function fetchProjects(
  limit: number = 50,
  offset: number = 0,
  signal?: AbortSignal
): Promise<ProjectListResponse> {
  const response = await fetch(`${API_BASE}/api/projects?limit=${limit}&offset=${offset}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load projects: ${response.status}`);
  }

  return safeParseJson<ProjectListResponse>(response);
}

export async function fetchProject(
  id: string,
  signal?: AbortSignal
): Promise<ProjectDetail> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.status}`);
  }

  return safeParseJson<ProjectDetail>(response);
}

export async function createProject(
  payload: ProjectCreateInput,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const response = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create project: ${response.status}`);
  }

  return safeParseJson<ProjectSummary>(response);
}

export async function updateProject(
  id: string,
  payload: ProjectUpdateInput,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update project: ${response.status}`);
  }

  return safeParseJson<ProjectSummary>(response);
}

export async function deleteProject(
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete project: ${response.status}`);
  }
}

export async function createProjectConversation(
  projectId: string,
  title?: string,
  signal?: AbortSignal
): Promise<ConversationSummary> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to create project conversation: ${response.status}`);
  }

  return safeParseJson<ConversationSummary>(response);
}

export async function pinFileToProject(
  projectId: string,
  fileId: string,
  signal?: AbortSignal
): Promise<ProjectDetail> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/pin-file`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to pin file to project: ${response.status}`);
  }

  return safeParseJson<ProjectDetail>(response);
}

export async function unpinFileFromProject(
  projectId: string,
  fileId: string,
  signal?: AbortSignal
): Promise<ProjectDetail> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/unpin-file`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to unpin file from project: ${response.status}`);
  }

  return safeParseJson<ProjectDetail>(response);
}

export function getStreamUrl(): string {
  return `${API_BASE}/api/chat/stream`;
}

// Browser Agent Endpoints (Phase 3)

export async function fetchWorkerStatus(signal?: AbortSignal): Promise<WorkerStatus> {
  const response = await fetch(`${API_BASE}/api/browser/worker/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Worker status check failed: ${response.status}`);
  }
  return safeParseJson<WorkerStatus>(response);
}

export async function createBrowserTask(
  taskDescription: string,
  initialUrl?: string,
  signal?: AbortSignal
): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      task_description: taskDescription,
      initial_url: initialUrl || null,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create browser task: ${response.status} ${errorText}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function fetchBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch browser task: ${response.status}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function listBrowserTasks(
  limit: number = 20,
  offset: number = 0,
  signal?: AbortSignal
): Promise<{ items: BrowserTask[]; total: number }> {
  const response = await fetch(`${API_BASE}/api/browser/tasks?limit=${limit}&offset=${offset}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to list browser tasks: ${response.status}`);
  }
  return safeParseJson<{ items: BrowserTask[]; total: number }>(response);
}

export async function approveBrowserTask(
  taskId: string,
  approved: boolean = true,
  signal?: AbortSignal
): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ approved }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to approve task: ${response.status} ${err}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function confirmBrowserTaskAction(
  taskId: string,
  approved: boolean,
  reason?: string,
  signal?: AbortSignal
): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/confirm`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ approved, reason: reason || null }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to submit confirmation: ${response.status} ${err}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function cancelBrowserTask(
  taskId: string,
  reason: string = 'User requested cancellation',
  signal?: AbortSignal
): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    throw new Error(`Failed to cancel task: ${response.status}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function fetchBrowserTaskEvents(
  taskId: string,
  signal?: AbortSignal
): Promise<BrowserTaskEvent[]> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/events`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load task events: ${response.status}`);
  }
  return safeParseJson<BrowserTaskEvent[]>(response);
}

export function getBrowserStreamUrl(taskId: string): string {
  return `${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/stream`;
}



export async function pauseBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/pause`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to pause task: ${response.status}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function resumeBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/resume`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to resume task: ${response.status}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function retryBrowserTask(
  taskId: string,
  resetToCheckpoint: boolean = true,
  signal?: AbortSignal
): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ reset_to_checkpoint: resetToCheckpoint }),
  });
  if (!response.ok) {
    throw new Error(`Failed to retry task: ${response.status}`);
  }
  return safeParseJson<BrowserTask>(response);
}

export async function fetchBrowserTaskScreenshot(
  taskId: string,
  signal?: AbortSignal
): Promise<{ screenshot_data_url: string | null; url?: string }> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/screenshot`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return { screenshot_data_url: null };
  }
  return safeParseJson<{ screenshot_data_url: string | null; url?: string }>(response);
}

// ==========================================
// Phase 4: Tasks, Calendar & Reminders Endpoints
// ==========================================

export async function fetchTasks(
  params?: {
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal
): Promise<TaskListResponse> {
  const url = buildUrl('/api/tasks');
  if (params?.status) url.searchParams.set('status', params.status);
  if (params?.priority) url.searchParams.set('priority', params.priority);
  if (params?.search) url.searchParams.set('search', params.search);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.pageSize) url.searchParams.set('page_size', String(params.pageSize));

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`);
  return safeParseJson<TaskListResponse>(res);
}

export async function createTask(payload: TaskCreatePayload, signal?: AbortSignal): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create task: ${res.status} ${err}`);
  }
  return safeParseJson<Task>(res);
}

export async function updateTask(
  taskId: string,
  payload: TaskUpdatePayload,
  signal?: AbortSignal
): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
  return safeParseJson<Task>(res);
}

export async function toggleTask(
  taskId: string,
  completed?: boolean,
  signal?: AbortSignal
): Promise<Task> {
  const url = buildUrl(`/api/tasks/${encodeURIComponent(taskId)}/toggle`);
  if (completed !== undefined) {
    url.searchParams.set('completed', String(completed));
  }
  const res = await fetch(url.toString(), {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to toggle task: ${res.status}`);
  return safeParseJson<Task>(res);
}

export async function deleteTask(taskId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    signal,
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
}

export async function extractTasksAndEvents(
  payload: ExtractRequest,
  signal?: AbortSignal
): Promise<ExtractResponse> {
  const res = await fetch(`${API_BASE}/api/tasks/extract`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await safeParseJson<Record<string, any>>(res).catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Extraction failed with status ${res.status}`);
  }
  return safeParseJson<ExtractResponse>(res);
}

export async function fetchCalendarEvents(
  start?: string,
  end?: string,
  signal?: AbortSignal
): Promise<CalendarEventsQueryResponse> {
  const url = buildUrl('/api/calendar/events');
  if (start) url.searchParams.set('start', start);
  if (end) url.searchParams.set('end', end);

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load calendar events: ${res.status}`);
  return safeParseJson<CalendarEventsQueryResponse>(res);
}

export async function createCalendarEvent(
  payload: CalendarEventCreatePayload,
  signal?: AbortSignal
): Promise<CalendarEvent> {
  const res = await fetch(`${API_BASE}/api/calendar/events`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create event: ${res.status} ${err}`);
  }
  return safeParseJson<CalendarEvent>(res);
}

export async function updateCalendarEvent(
  eventId: string,
  payload: CalendarEventUpdatePayload,
  signal?: AbortSignal
): Promise<CalendarEvent> {
  const res = await fetch(`${API_BASE}/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update event: ${res.status}`);
  return safeParseJson<CalendarEvent>(res);
}

export async function deleteCalendarEvent(eventId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    signal,
  });
  if (!res.ok) throw new Error(`Failed to delete event: ${res.status}`);
}

export async function fetchReminders(
  activeOnly: boolean = false,
  status?: string,
  limit: number = 100,
  signal?: AbortSignal
): Promise<ReminderListResponse> {
  const url = buildUrl('/api/reminders');
  if (activeOnly) url.searchParams.set('active_only', 'true');
  if (status) url.searchParams.set('status', status);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load reminders: ${res.status}`);
  return safeParseJson<ReminderListResponse>(res);
}

export async function createReminder(
  payload: ReminderCreatePayload,
  signal?: AbortSignal
): Promise<Reminder> {
  const res = await fetch(`${API_BASE}/api/reminders`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create reminder: ${res.status}`);
  return safeParseJson<Reminder>(res);
}

export async function dismissReminder(
  reminderId: string,
  signal?: AbortSignal
): Promise<Reminder> {
  const res = await fetch(`${API_BASE}/api/reminders/${encodeURIComponent(reminderId)}/dismiss`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to dismiss reminder: ${res.status}`);
  return safeParseJson<Reminder>(res);
}

export async function deleteReminder(reminderId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reminders/${encodeURIComponent(reminderId)}`, {
    method: 'DELETE',
    signal,
  });
  if (!res.ok) throw new Error(`Failed to delete reminder: ${res.status}`);
}

// ==========================================
// Phase 5: Files & Knowledge Endpoints
// ==========================================

export async function uploadFile(
  file: File,
  signal?: AbortSignal
): Promise<FileMetadata> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/files/upload`, {
    method: 'POST',
    signal,
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Upload failed with status ${res.status}`;
    try {
      const errJson = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return safeParseJson<FileMetadata>(res);
}

export async function fetchFiles(
  statusFilter?: string,
  search?: string,
  signal?: AbortSignal
): Promise<FileListResponse> {
  const url = buildUrl('/api/files');
  if (statusFilter) url.searchParams.set('status', statusFilter);
  if (search) url.searchParams.set('search', search);

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`);
  return safeParseJson<FileListResponse>(res);
}

export async function fetchFileDetail(
  fileId: string,
  signal?: AbortSignal
): Promise<FileDetailResponse> {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch file details: ${res.status}`);
  return safeParseJson<FileDetailResponse>(res);
}

export async function fetchFileStatus(
  fileId: string,
  signal?: AbortSignal
): Promise<FileStatusResponse> {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch file status: ${res.status}`);
  return safeParseJson<FileStatusResponse>(res);
}

export async function deleteFile(
  fileId: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    signal,
  });

  if (!res.ok) throw new Error(`Failed to delete file: ${res.status}`);
}

export async function reprocessFile(
  fileId: string,
  signal?: AbortSignal
): Promise<FileMetadata> {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}/reprocess`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to reprocess file: ${res.status}`);
  return safeParseJson<FileMetadata>(res);
}

export async function searchKnowledge(
  payload: KnowledgeSearchRequest,
  signal?: AbortSignal
): Promise<KnowledgeSearchResponse> {
  const res = await fetch(`${API_BASE}/api/knowledge/search`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Knowledge search failed: ${res.status}`);
  return safeParseJson<KnowledgeSearchResponse>(res);
}

export async function answerKnowledge(
  payload: KnowledgeAnswerRequest,
  signal?: AbortSignal
): Promise<KnowledgeAnswerResponse> {
  const res = await fetch(`${API_BASE}/api/knowledge/answer`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorDetail = `Knowledge answer failed with status ${res.status}`;
    try {
      const errJson = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return safeParseJson<KnowledgeAnswerResponse>(res);
}

// --- Phase 6: Web Research & Intelligence API ---

export async function createResearchJob(
  payload: ResearchJobCreate,
  signal?: AbortSignal
): Promise<ResearchJob> {
  const res = await fetch(`${API_BASE}/api/research/jobs`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = `Failed to create research job (${res.status})`;
    try {
      const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return safeParseJson<ResearchJob>(res);
}

export async function fetchResearchJobs(
  params?: { status?: string; limit?: number; offset?: number },
  signal?: AbortSignal
): Promise<ResearchJobListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));

  const qs = query.toString();
  const url = `${API_BASE}/api/research/jobs${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });

  if (!res.ok) throw new Error(`Failed to fetch research jobs: ${res.status}`);
  return safeParseJson<ResearchJobListResponse>(res);
}

export async function fetchResearchJobDetail(
  jobId: string,
  signal?: AbortSignal
): Promise<ResearchJobDetailResponse> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch research job detail: ${res.status}`);
  return safeParseJson<ResearchJobDetailResponse>(res);
}

export async function approveResearchJob(
  jobId: string,
  signal?: AbortSignal
): Promise<ResearchJob> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    let detail = `Failed to approve research plan: ${res.status}`;
    try {
      const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return safeParseJson<ResearchJob>(res);
}

export async function cancelResearchJob(
  jobId: string,
  reason?: string,
  signal?: AbortSignal
): Promise<ResearchJob> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ reason: reason || 'Cancelled by user' }),
  });

  if (!res.ok) {
    let detail = `Failed to cancel research job: ${res.status}`;
    try {
      const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return safeParseJson<ResearchJob>(res);
}

export async function fetchResearchSources(
  jobId: string,
  signal?: AbortSignal
): Promise<ResearchSource[]> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/sources`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch research sources: ${res.status}`);
  return safeParseJson<ResearchSource[]>(res);
}

export async function fetchResearchSource(
  jobId: string,
  sourceId: string,
  signal?: AbortSignal
): Promise<ResearchSource> {
  const res = await fetch(
    `${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/sources/${encodeURIComponent(sourceId)}`,
    { signal, headers: { Accept: 'application/json' } }
  );

  if (!res.ok) throw new Error(`Failed to fetch research source: ${res.status}`);
  return safeParseJson<ResearchSource>(res);
}

export async function fetchResearchReport(
  jobId: string,
  signal?: AbortSignal
): Promise<ResearchReport> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/report`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to fetch research report: ${res.status}`);
  return safeParseJson<ResearchReport>(res);
}

export async function exportResearchReportMarkdown(
  jobId: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/research/jobs/${encodeURIComponent(jobId)}/export`, {
    signal,
    headers: { Accept: 'text/markdown' },
  });

  if (!res.ok) throw new Error(`Failed to export research report: ${res.status}`);
  return await res.text();
}

// --- Phase 7: Wi-Fi Sensing API ---

export async function fetchSensingStatus(signal?: AbortSignal): Promise<WifiSensingStatusResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing status: ${res.status}`);
  return safeParseJson<WifiSensingStatusResponse>(res);
}

export async function fetchSensingCapabilities(signal?: AbortSignal): Promise<SensingCapabilitiesResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/capabilities`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing capabilities: ${res.status}`);
  return safeParseJson<SensingCapabilitiesResponse>(res);
}

export async function fetchSensorConfigs(signal?: AbortSignal): Promise<SensorConfig[]> {
  const res = await fetch(`${API_BASE}/api/sensing/configs`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensor configs: ${res.status}`);
  return safeParseJson<SensorConfig[]>(res);
}

export async function createSensorConfig(
  payload: SensorConfigCreate,
  signal?: AbortSignal
): Promise<SensorConfig> {
  const res = await fetch(`${API_BASE}/api/sensing/configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to create sensor config: ${res.status}`);
  }
  return safeParseJson<SensorConfig>(res);
}

export async function updateSensorConfig(
  configId: string,
  payload: SensorConfigUpdate,
  signal?: AbortSignal
): Promise<SensorConfig> {
  const res = await fetch(`${API_BASE}/api/sensing/configs/${encodeURIComponent(configId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to update sensor config: ${res.status}`);
  }
  return safeParseJson<SensorConfig>(res);
}

export async function startSensingSimulation(
  roomId: string,
  speed = 1.0,
  signal?: AbortSignal
): Promise<SimulationControlResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ room_id: roomId, speed }),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to start simulation: ${res.status}`);
  }
  return safeParseJson<SimulationControlResponse>(res);
}

export async function stopSensingSimulation(
  roomId: string,
  signal?: AbortSignal
): Promise<SimulationControlResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/simulation/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to stop simulation: ${res.status}`);
  }
  return safeParseJson<SimulationControlResponse>(res);
}

export async function resetSensingSimulation(
  roomId: string,
  signal?: AbortSignal
): Promise<SimulationControlResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/simulation/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to reset simulation: ${res.status}`);
  }
  return safeParseJson<SimulationControlResponse>(res);
}

export async function stepSensingSimulation(
  roomId: string,
  signal?: AbortSignal
): Promise<SensingEvent | null> {
  const res = await fetch(`${API_BASE}/api/sensing/simulation/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to step simulation: ${res.status}`);
  return safeParseJson<SensingEvent | null>(res);
}

export async function fetchSensingEvents(
  roomId?: string,
  limit = 50,
  offset = 0,
  signal?: AbortSignal
): Promise<SensingEventListResponse> {
  const params = new URLSearchParams();
  if (roomId) params.set('room_id', roomId);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  const res = await fetch(`${API_BASE}/api/sensing/events?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing events: ${res.status}`);
  return safeParseJson<SensingEventListResponse>(res);
}

export async function fetchSensingSummary(
  roomId: string,
  signal?: AbortSignal
): Promise<SensingOccupancySummary> {
  const res = await fetch(`${API_BASE}/api/sensing/summary?room_id=${encodeURIComponent(roomId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing summary: ${res.status}`);
  return safeParseJson<SensingOccupancySummary>(res);
}

export async function purgeSensingEvents(
  roomId?: string,
  beforeDate?: string,
  signal?: AbortSignal
): Promise<SensingPurgeResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/events`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ room_id: roomId, before_date: beforeDate, confirm_purge: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to purge events: ${res.status}`);
  return safeParseJson<SensingPurgeResponse>(res);
}

export async function fetchSensingAudits(
  limit = 50,
  offset = 0,
  signal?: AbortSignal
): Promise<WifiSensingAudit[]> {
  const res = await fetch(`${API_BASE}/api/sensing/audit?limit=${limit}&offset=${offset}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing audits: ${res.status}`);
  return safeParseJson<WifiSensingAudit[]>(res);
}

export async function fetchRoomCalibration(
  roomId: string,
  signal?: AbortSignal
): Promise<CalibrationProfile> {
  const url = buildUrl(`/api/sensing/calibration/${encodeURIComponent(roomId)}`);
  const res = await fetch(url.toString(), {
    signal,
    headers: getBaseHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch room calibration: ${res.status}`);
  return safeParseJson<CalibrationProfile>(res);
}

export async function saveRoomCalibration(
  roomId: string,
  profile: CalibrationProfile,
  signal?: AbortSignal
): Promise<CalibrationProfile> {
  const url = buildUrl(`/api/sensing/calibration/${encodeURIComponent(roomId)}`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(profile),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to save calibration: ${res.status}`);
  }
  return safeParseJson<CalibrationProfile>(res);
}

export async function recordRoomBaseline(
  roomId: string,
  sampleDurationSeconds = 5,
  signal?: AbortSignal
): Promise<BaselineCalibrationResult> {
  const url = buildUrl(`/api/sensing/calibration/${encodeURIComponent(roomId)}/record-baseline`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ room_id: roomId, sample_duration_seconds: sampleDurationSeconds }),
    signal,
  });
  if (!res.ok) {
    const err = await safeParseJson<{ detail?: string }>(res).catch(() => ({ detail: undefined }));
    throw new Error(err.detail || `Failed to record baseline: ${res.status}`);
  }
  return safeParseJson<BaselineCalibrationResult>(res);
}

// ---------------------------------------------------------------------------
// Phase 9: Unified AI Orchestration Engine API Client
// ---------------------------------------------------------------------------

export async function createWorkflow(
  payload: WorkflowCreateRequest,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create workflow: ${res.status} ${err}`);
  }
  return safeParseJson<Workflow>(res);
}

export async function listWorkflows(
  status?: string,
  limit: number = 20,
  offset: number = 0,
  signal?: AbortSignal
): Promise<WorkflowListResponse> {
  const url = buildUrl('/api/orchestration/workflows');
  if (status) url.searchParams.set('status', status);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to list workflows: ${res.status}`);
  return safeParseJson<WorkflowListResponse>(res);
}

export async function getWorkflow(
  workflowId: string,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load workflow: ${res.status}`);
  return safeParseJson<Workflow>(res);
}

export async function getWorkflowPlan(
  workflowId: string,
  signal?: AbortSignal
): Promise<WorkflowPlan> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/plan`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load workflow plan: ${res.status}`);
  return safeParseJson<WorkflowPlan>(res);
}

export async function approveWorkflowPlan(
  workflowId: string,
  payload: WorkflowApproveRequest,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/approve`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to approve workflow: ${res.status} ${err}`);
  }
  return safeParseJson<Workflow>(res);
}

export async function submitWorkflowClarification(
  workflowId: string,
  payload: WorkflowClarifyRequest,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/clarify`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to submit clarification: ${res.status} ${err}`);
  }
  return safeParseJson<Workflow>(res);
}

export async function confirmWorkflowStep(
  workflowId: string,
  payload: WorkflowConfirmStepRequest,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/confirm`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to confirm step: ${res.status} ${err}`);
  }
  return safeParseJson<Workflow>(res);
}

export async function cancelWorkflow(
  workflowId: string,
  payload: WorkflowCancelRequest,
  signal?: AbortSignal
): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/cancel`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to cancel workflow: ${res.status} ${err}`);
  }
  return safeParseJson<Workflow>(res);
}

export async function listWorkflowEvents(
  workflowId: string,
  signal?: AbortSignal
): Promise<WorkflowEvent[]> {
  const res = await fetch(`${API_BASE}/api/orchestration/workflows/${encodeURIComponent(workflowId)}/events`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to list workflow events: ${res.status}`);
  return safeParseJson<WorkflowEvent[]>(res);
}

// Data Retention & Privacy APIs (72-Hour Automatic Purge)
export async function fetchRetentionStatus(signal?: AbortSignal): Promise<RetentionStatusResponse> {
  const res = await fetch(`${API_BASE}/api/retention/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch retention status: ${res.status}`);
  return safeParseJson<RetentionStatusResponse>(res);
}

export async function triggerRetentionCleanup(signal?: AbortSignal): Promise<RetentionCleanupResponse> {
  const res = await fetch(`${API_BASE}/api/retention/cleanup`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to trigger retention cleanup: ${res.status}`);
  return safeParseJson<RetentionCleanupResponse>(res);
}

export async function purgeAllUserData(confirmPurge: boolean = true, signal?: AbortSignal): Promise<RetentionPurgeResponse> {
  const res = await fetch(`${API_BASE}/api/retention/purge-my-data`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ confirm_purge: confirmPurge }),
  });
  if (!res.ok) throw new Error(`Failed to purge user data: ${res.status}`);
  return safeParseJson<RetentionPurgeResponse>(res);
}

export { API_BASE };

// --- ESP32 Hardware Endpoints ---

export async function fetchEsp32Status(signal?: AbortSignal): Promise<Esp32HardwareStatus> {
  const response = await fetch(`${API_BASE}/api/sensing/esp32/status`, {
    signal,
    headers: getBaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ESP32 status: ${response.status}`);
  }
  return safeParseJson<Esp32HardwareStatus>(response);
}

export async function connectEsp32(
  port: string = 'COM7',
  baudRate: number = 921600,
  signal?: AbortSignal
): Promise<Esp32HardwareStatus> {
  const response = await fetch(`${API_BASE}/api/sensing/esp32/connect`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ port, baud_rate: baudRate }),
  });
  if (!response.ok) {
    throw new Error(`Failed to connect ESP32: ${response.status}`);
  }
  return safeParseJson<Esp32HardwareStatus>(response);
}

export async function disconnectEsp32(signal?: AbortSignal): Promise<Esp32HardwareStatus> {
  const response = await fetch(`${API_BASE}/api/sensing/esp32/disconnect`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to disconnect ESP32: ${response.status}`);
  }
  return safeParseJson<Esp32HardwareStatus>(response);
}

export async function calibrateEsp32(
  durationSeconds: number = 5,
  signal?: AbortSignal
): Promise<Esp32HardwareStatus> {
  const response = await fetch(`${API_BASE}/api/sensing/esp32/calibrate`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ duration_seconds: durationSeconds }),
  });
  if (!response.ok) {
    throw new Error(`Failed to start ESP32 calibration: ${response.status}`);
  }
  return safeParseJson<Esp32HardwareStatus>(response);
}

export async function clearEsp32Calibration(signal?: AbortSignal): Promise<Esp32HardwareStatus> {
  const response = await fetch(`${API_BASE}/api/sensing/esp32/calibrate/clear`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to clear ESP32 calibration: ${response.status}`);
  }
  return safeParseJson<Esp32HardwareStatus>(response);
}

// --- Phase 4 & Phase 8: Coding Workspace & Intelligence APIs ---

export interface WorkspaceFileItem {
  path: string;
  relative_path: string;
  size_bytes: number;
  is_directory: boolean;
}

export interface WorkspaceInspectResponse {
  files: WorkspaceFileItem[];
  total_count: number;
  tests_enabled: boolean;
}

export interface CodeReadResponse {
  file_path: string;
  content: string;
}

export interface CodeModifyResponse {
  file_path: string;
  status: string;
  lines_added: number;
  lines_removed: number;
  diff_summary: string;
  error?: string | null;
}

export interface CodeModificationPreview {
  file_path: string;
  status: string;
  original_sha256: string | null;
  diff: string;
  lines_added: number;
  lines_removed: number;
}

export interface TestExecutionResponse {
  passed: boolean;
  exit_code: number;
  tests_run: number;
  tests_failed: number;
  duration_seconds: number;
  stdout: string;
  stderr: string;
}

export interface AutomationItem {
  id: string;
  name: string;
  task_goal: string;
  capability: string;
  schedule_cron?: string | null;
  interval_hours?: number | null;
  enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

async function codingRequestError(response: Response, action: string): Promise<Error> {
  const body = await response.text();
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    detail = parsed.detail || body;
  } catch {
    detail = body;
  }
  return new Error(`${action} (${response.status}): ${detail || response.statusText}`);
}

export async function inspectCodeWorkspace(
  maxFiles = 50,
  signal?: AbortSignal
): Promise<WorkspaceInspectResponse> {
  const response = await fetch(`${API_BASE}/api/intelligence/coding/inspect`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ max_files: maxFiles }),
  });
  if (!response.ok) {
    throw await codingRequestError(response, 'Failed to inspect workspace');
  }
  return safeParseJson<WorkspaceInspectResponse>(response);
}

export async function readSourceFile(
  filePath: string,
  maxLines = 500,
  signal?: AbortSignal
): Promise<CodeReadResponse> {
  const response = await fetch(`${API_BASE}/api/intelligence/coding/read`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file_path: filePath, max_lines: maxLines }),
  });
  if (!response.ok) {
    throw await codingRequestError(response, 'Failed to read source file');
  }
  return safeParseJson<CodeReadResponse>(response);
}

export async function modifySourceFile(
  filePath: string,
  newContent: string,
  expectedSha256: string | null,
  signal?: AbortSignal
): Promise<CodeModifyResponse> {
  const response = await fetch(`${API_BASE}/api/intelligence/coding/modify`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      file_path: filePath,
      new_content: newContent,
      expected_sha256: expectedSha256,
    }),
  });
  if (!response.ok) {
    throw await codingRequestError(response, 'Failed to apply modification');
  }
  return safeParseJson<CodeModifyResponse>(response);
}

export async function previewSourceModification(
  filePath: string,
  newContent: string,
  signal?: AbortSignal
): Promise<CodeModificationPreview> {
  const response = await fetch(`${API_BASE}/api/intelligence/coding/preview`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file_path: filePath, new_content: newContent }),
  });
  if (!response.ok) {
    throw await codingRequestError(response, 'Failed to preview modification');
  }
  return safeParseJson<CodeModificationPreview>(response);
}

export async function executeCodeTests(
  testTarget?: string,
  timeoutSeconds = 30,
  signal?: AbortSignal
): Promise<TestExecutionResponse> {
  const response = await fetch(`${API_BASE}/api/intelligence/coding/test`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      test_target: testTarget,
      timeout_seconds: timeoutSeconds,
    }),
  });
  if (!response.ok) {
    throw await codingRequestError(response, 'Failed to execute tests');
  }
  return safeParseJson<TestExecutionResponse>(response);
}

export async function fetchAutomations(signal?: AbortSignal): Promise<AutomationItem[]> {
  const response = await fetch(`${API_BASE}/api/intelligence/automations`, {
    method: 'GET',
    signal,
    headers: getBaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch automations: ${response.status}`);
  }
  return safeParseJson<AutomationItem[]>(response);
}

export async function createAutomation(
  payload: {
    name: string;
    task_goal: string;
    capability?: string;
    schedule_cron?: string;
    interval_hours?: number;
  },
  signal?: AbortSignal
): Promise<AutomationItem> {
  const response = await fetch(`${API_BASE}/api/intelligence/automations`, {
    method: 'POST',
    signal,
    headers: getBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to create automation: ${response.status}`);
  }
  return safeParseJson<AutomationItem>(response);
}
