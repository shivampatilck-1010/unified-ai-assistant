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
  ExtractRequest,
  ExtractResponse,
  FileDetailResponse,
  FileListResponse,
  FileMetadata,
  FileStatusResponse,
  HealthResponse,
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
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const raw = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');
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
  return currentAuthToken;
}

export function getBaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };
  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

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

  return (await response.json()) as ReadinessResponse;
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

// Browser Agent Endpoints (Phase 3)

export async function fetchWorkerStatus(signal?: AbortSignal): Promise<WorkerStatus> {
  const response = await fetch(`${API_BASE}/api/browser/worker/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Worker status check failed: ${response.status}`);
  }
  return (await response.json()) as WorkerStatus;
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
  return (await response.json()) as BrowserTask;
}

export async function fetchBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch browser task: ${response.status}`);
  }
  return (await response.json()) as BrowserTask;
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
  return (await response.json()) as { items: BrowserTask[]; total: number };
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
  return (await response.json()) as BrowserTask;
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
  return (await response.json()) as BrowserTask;
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
  return (await response.json()) as BrowserTask;
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
  return (await response.json()) as BrowserTaskEvent[];
}

export function getBrowserStreamUrl(taskId: string): string {
  return `${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/stream`;
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
  return (await res.json()) as TaskListResponse;
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
  return (await res.json()) as Task;
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
  return (await res.json()) as Task;
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
  return (await res.json()) as Task;
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Extraction failed with status ${res.status}`);
  }
  return (await res.json()) as ExtractResponse;
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
  return (await res.json()) as CalendarEventsQueryResponse;
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
  return (await res.json()) as CalendarEvent;
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
  return (await res.json()) as CalendarEvent;
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
  return (await res.json()) as ReminderListResponse;
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
  return (await res.json()) as Reminder;
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
  return (await res.json()) as Reminder;
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
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as FileMetadata;
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
  return (await res.json()) as FileListResponse;
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
  return (await res.json()) as FileDetailResponse;
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
  return (await res.json()) as FileStatusResponse;
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
  return (await res.json()) as FileMetadata;
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
  return (await res.json()) as KnowledgeSearchResponse;
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
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as KnowledgeAnswerResponse;
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
      const err = await res.json();
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as ResearchJob;
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
  return (await res.json()) as ResearchJobListResponse;
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
  return (await res.json()) as ResearchJobDetailResponse;
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
      const err = await res.json();
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as ResearchJob;
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
      const err = await res.json();
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as ResearchJob;
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
  return (await res.json()) as ResearchSource[];
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
  return (await res.json()) as ResearchSource;
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
  return (await res.json()) as ResearchReport;
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
  return (await res.json()) as WifiSensingStatusResponse;
}

export async function fetchSensingCapabilities(signal?: AbortSignal): Promise<SensingCapabilitiesResponse> {
  const res = await fetch(`${API_BASE}/api/sensing/capabilities`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensing capabilities: ${res.status}`);
  return (await res.json()) as SensingCapabilitiesResponse;
}

export async function fetchSensorConfigs(signal?: AbortSignal): Promise<SensorConfig[]> {
  const res = await fetch(`${API_BASE}/api/sensing/configs`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch sensor configs: ${res.status}`);
  return (await res.json()) as SensorConfig[];
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create sensor config: ${res.status}`);
  }
  return (await res.json()) as SensorConfig;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update sensor config: ${res.status}`);
  }
  return (await res.json()) as SensorConfig;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to start simulation: ${res.status}`);
  }
  return (await res.json()) as SimulationControlResponse;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to stop simulation: ${res.status}`);
  }
  return (await res.json()) as SimulationControlResponse;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to reset simulation: ${res.status}`);
  }
  return (await res.json()) as SimulationControlResponse;
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
  return (await res.json()) as SensingEvent | null;
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
  return (await res.json()) as SensingEventListResponse;
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
  return (await res.json()) as SensingOccupancySummary;
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
  return (await res.json()) as SensingPurgeResponse;
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
  return (await res.json()) as WifiSensingAudit[];
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
  return (await res.json()) as CalibrationProfile;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to save calibration: ${res.status}`);
  }
  return (await res.json()) as CalibrationProfile;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to record baseline: ${res.status}`);
  }
  return (await res.json()) as BaselineCalibrationResult;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as WorkflowListResponse;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as WorkflowPlan;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as Workflow;
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
  return (await res.json()) as WorkflowEvent[];
}

// Data Retention & Privacy APIs (72-Hour Automatic Purge)
export async function fetchRetentionStatus(signal?: AbortSignal): Promise<RetentionStatusResponse> {
  const res = await fetch(`${API_BASE}/api/retention/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch retention status: ${res.status}`);
  return (await res.json()) as RetentionStatusResponse;
}

export async function triggerRetentionCleanup(signal?: AbortSignal): Promise<RetentionCleanupResponse> {
  const res = await fetch(`${API_BASE}/api/retention/cleanup`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to trigger retention cleanup: ${res.status}`);
  return (await res.json()) as RetentionCleanupResponse;
}

export async function purgeAllUserData(confirmPurge: boolean = true, signal?: AbortSignal): Promise<RetentionPurgeResponse> {
  const res = await fetch(`${API_BASE}/api/retention/purge-my-data`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ confirm_purge: confirmPurge }),
  });
  if (!res.ok) throw new Error(`Failed to purge user data: ${res.status}`);
  return (await res.json()) as RetentionPurgeResponse;
}

export { API_BASE };
