// SSE streaming event types — aligned with backend Pydantic models

export type SSEEventType = 'message_start' | 'text_delta' | 'message_complete' | 'error';

export interface SSEEvent {
  event: SSEEventType;
  conversation_id: string;
  message_id: string;
  data: Record<string, unknown>;
}

export interface MessageStartData {
  role: 'assistant';
}

export interface TextDeltaData {
  text: string;
}

export interface MessageCompleteData {
  finish_reason: 'stop' | 'error' | 'cancelled';
  provider?: string;
  model?: string;
}

export interface ErrorData {
  code: string;
  message: string;
}

export interface ChatRequest {
  conversation_id: string | null;
  message: string;
  provider?: string | null;
  model?: string | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database?: string;
  timestamp: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_window?: number | null;
  is_default: boolean;
}

export interface UnifiedProviderStatusResponse {
  configured: boolean;
  provider?: string | null;
  active_provider?: string | null;
  active_model?: string | null;
  available_models: ModelInfo[];
  providers: Record<string, boolean>;
  message: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  conversation_id?: string;
  role: MessageRole;
  content: string;
  status?: string;
  provider?: string | null;
  model?: string | null;
  timestamp?: number;
  created_at?: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ConversationSummary {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConversationDetail {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

// Backward-compatible alias for local storage helper
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt?: number;
  updatedAt?: number;
  created_at?: string;
  updated_at?: string;
  owner_id?: string;
}

export interface SearchMatch {
  conversation_id: string;
  conversation_title: string;
  matched_type: string;
  message_id?: string | null;
  snippet: string;
  created_at: string;
}

export interface SearchResponse {
  query: string;
  matches: SearchMatch[];
  total: number;
}

// Browser Agent Task & Worker Types (Phase 3)

export type BrowserActionType =
  | 'navigate'
  | 'inspect'
  | 'read_text'
  | 'click'
  | 'type_text'
  | 'scroll'
  | 'wait_for'
  | 'screenshot';

export type BrowserTaskStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BrowserAction {
  action_type: BrowserActionType;
  url?: string | null;
  selector?: string | null;
  text?: string | null;
  direction?: string | null;
  amount?: number | null;
  condition?: string | null;
  timeout_ms?: number | null;
  is_consequential?: boolean;
  consequential_reason?: string | null;
}

export interface BrowserPlanStep {
  step_index: number;
  description: string;
  action: BrowserAction;
}

export interface BrowserPlan {
  goal: string;
  steps: BrowserPlanStep[];
  estimated_steps: number;
  allowed_domains: string[];
}

export interface PendingConfirmation {
  confirmation_id: string;
  step_index: number;
  action_type: string;
  target?: string | null;
  data?: string | null;
  reason: string;
}

export interface BrowserTaskEvent {
  id: string;
  task_id: string;
  step_index?: number | null;
  event_type: string;
  message: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface BrowserTask {
  id: string;
  owner_id: string;
  task_description: string;
  status: BrowserTaskStatus;
  current_step: number;
  plan?: BrowserPlan | null;
  approved_scope?: {
    allowed_domains: string[];
    max_steps: number;
    allowed_actions: string[];
  } | null;
  pending_confirmation?: PendingConfirmation | null;
  result_summary?: string | null;
  error_message?: string | null;
  cancellation_reason?: string | null;
  evidence?: Array<Record<string, unknown>> | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WorkerStatus {
  available: boolean;
  runtime: string;
  active_tasks: number;
  browser_session_strategy: string;
  message: string;
}

export type NavigationSection =
  | 'chat'
  | 'search'
  | 'projects'
  | 'browser-agent'
  | 'calendar'
  | 'files'
  | 'wifi-sensing'
  | 'settings';

export type BackendStatus = 'checking' | 'connected' | 'disconnected' | 'error';

// Phase 4: Task & Calendar Engine Types

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  owner_id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
  timezone?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
  timezone?: string;
  conversation_id?: string | null;
  message_id?: string | null;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
  timezone?: string;
  conversation_id?: string | null;
  message_id?: string | null;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  page: number;
  page_size: number;
}

export interface CalendarEvent {
  id: string;
  owner_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  all_day: boolean;
  location?: string | null;
  recurrence_rule?: string | null;
  color?: string | null;
  conversation_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventOccurrence {
  event_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  all_day: boolean;
  location?: string | null;
  color?: string | null;
  is_recurring: boolean;
  recurrence_rule?: string | null;
}

export interface CalendarEventCreatePayload {
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  timezone?: string;
  all_day?: boolean;
  location?: string | null;
  recurrence_rule?: string | null;
  color?: string | null;
  conversation_id?: string | null;
}

export interface CalendarEventUpdatePayload {
  title?: string;
  description?: string | null;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  all_day?: boolean;
  location?: string | null;
  recurrence_rule?: string | null;
  color?: string | null;
  conversation_id?: string | null;
}

export interface CalendarEventsQueryResponse {
  events: CalendarEvent[];
  occurrences: CalendarEventOccurrence[];
}

export type ReminderStatus = 'scheduled' | 'processing' | 'delivered' | 'dismissed' | 'failed';

export interface Reminder {
  id: string;
  owner_id: string;
  title: string;
  task_id?: string | null;
  event_id?: string | null;
  scheduled_time: string;
  timezone: string;
  status: ReminderStatus;
  delivery_attempts: number;
  last_error?: string | null;
  delivered_at?: string | null;
  dismissed_at?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderCreatePayload {
  title: string;
  scheduled_time: string;
  timezone?: string;
  task_id?: string | null;
  event_id?: string | null;
  idempotency_key?: string | null;
}

export interface ReminderListResponse {
  items: Reminder[];
  total: number;
}

export interface ExtractedTaskProposal {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  due_date?: string | null;
  timezone: string;
}

export interface ExtractedEventProposal {
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  all_day: boolean;
  location?: string | null;
  recurrence_rule?: string | null;
}

export interface ExtractedReminderProposal {
  title: string;
  scheduled_time: string;
  timezone: string;
}

export interface ExtractRequest {
  text: string;
  reference_time?: string;
  timezone?: string;
  conversation_id?: string;
  message_id?: string;
}

export interface ExtractResponse {
  tasks: ExtractedTaskProposal[];
  events: ExtractedEventProposal[];
  reminders: ExtractedReminderProposal[];
  reference_time: string;
  timezone: string;
  explanation?: string | null;
  requires_confirmation: boolean;
}
