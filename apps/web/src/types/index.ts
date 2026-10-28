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
  use_knowledge?: boolean;
  selected_file_ids?: string[];
  use_research?: boolean;
  research_depth?: 'quick' | 'standard' | 'deep' | string;
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
  citations?: ChunkCitation[];
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

// --- Phase 5: Files & Knowledge Engine Types ---

export type FileStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface FileMetadata {
  id: string;
  owner_id: string;
  filename: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  content_hash: string;
  status: FileStatus;
  error_message?: string | null;
  page_count?: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChunkPreview {
  id: string;
  chunk_index: number;
  page_number?: number | null;
  section_title?: string | null;
  content: string;
  token_count: number;
}

export interface FileDetailResponse {
  file: FileMetadata;
  preview_chunks: ChunkPreview[];
}

export interface FileStatusResponse {
  id: string;
  status: FileStatus;
  chunk_count: number;
  error_message?: string | null;
  updated_at: string;
}

export interface FileListResponse {
  items: FileMetadata[];
  total: number;
  total_storage_bytes: number;
  max_storage_bytes: number;
  file_count: number;
  max_file_count: number;
}

export interface ChunkCitation {
  file_id: string;
  filename: string;
  chunk_index: number;
  page_number?: number | null;
  section_title?: string | null;
  snippet: string;
  score?: number | null;
}

export interface KnowledgeSearchRequest {
  query: string;
  file_ids?: string[];
  top_k?: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  results: ChunkCitation[];
  citations: ChunkCitation[];
  total_results: number;
  strategy_used: 'semantic' | 'lexical' | 'hybrid' | string;
}

export interface KnowledgeAnswerRequest {
  query: string;
  file_ids?: string[];
  provider?: string | null;
  model?: string | null;
}

export interface KnowledgeAnswerResponse {
  query: string;
  answer: string;
  citations: ChunkCitation[];
  sufficient_evidence: boolean;
  strategy_used: 'semantic' | 'lexical' | 'hybrid' | string;
}

// --- Phase 6: Web Research & Browser Intelligence ---

export type ResearchStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface ResearchStep {
  step_number: number;
  action: 'search' | 'browse' | 'compare_documents' | 'synthesize' | string;
  query_or_target: string;
  rationale: string;
}

export interface ResearchPlan {
  rationale: string;
  steps: ResearchStep[];
  target_domains?: string[];
  estimated_sources: number;
  requires_approval: boolean;
}

export interface ResearchCitation {
  citation_type: 'web' | 'document';
  citation_tag: string;
  source_id?: string | null;
  url_or_filename: string;
  title: string;
  page_number?: number | null;
  snippet: string;
}

export interface ResearchReport {
  title: string;
  executive_summary: string;
  key_findings: string[];
  evidence_and_analysis: string;
  conflicting_claims: string[];
  limitations_and_unresolved: string[];
  citations: ResearchCitation[];
}

export interface ResearchJob {
  id: string;
  owner_id: string;
  question: string;
  status: ResearchStatus;
  depth: ResearchDepth;
  allowed_domains?: string[] | null;
  file_ids?: string[] | null;
  max_sources: number;
  requires_approval: boolean;
  plan?: ResearchPlan | null;
  final_report?: ResearchReport | null;
  error_message?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface ResearchSource {
  id: string;
  job_id: string;
  owner_id: string;
  canonical_url: string;
  title: string;
  publisher: string;
  retrieval_timestamp: string;
  publication_date?: string | null;
  content_hash?: string | null;
  status: 'retrieved' | 'rejected' | 'failed' | 'pending';
  validation_status: 'valid' | 'blocked_ssrf' | 'flagged_injection' | 'unsupported_content_type' | 'unreachable';
  snippets: string[];
  created_at: string;
}

export interface ResearchEvent {
  id: string;
  job_id: string;
  event_type: string;
  message: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface ResearchJobCreate {
  question: string;
  depth?: ResearchDepth;
  allowed_domains?: string[];
  file_ids?: string[];
  max_sources?: number;
  requires_approval?: boolean;
}

export interface ResearchJobListResponse {
  items: ResearchJob[];
  total: number;
}

export interface ResearchJobDetailResponse {
  job: ResearchJob;
  sources: ResearchSource[];
  events: ResearchEvent[];
}
