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
  category?: string;
  retry_after?: number | null;
  routed_model?: string | null;
  retryable?: boolean;
  provider?: string | null;
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
  use_orchestration?: boolean;
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
  error_code?: string;
  error_category?: string;
  retry_after?: number | null;
  retryable?: boolean;
  routed_model?: string | null;
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
  | 'orchestration'
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

// --- Phase 7: Wi-Fi Sensing Types ---

export interface SensorCapabilityItem {
  provider_id: string;
  name: string;
  is_hardware: bool_or_boolean;
  is_simulated: boolean;
  is_available: boolean;
  unavailability_reason?: string | null;
  supported_measurements: string[];
  sampling_rate_hz: number;
  requires_authorization: boolean;
}

type bool_or_boolean = boolean;

export interface SensingCapabilitiesResponse {
  providers: SensorCapabilityItem[];
  active_provider_id: string;
  simulation_mode: boolean;
  hardware_available: boolean;
}

export interface WifiSensingStatusResponse {
  status: string;
  service: string;
  simulation_mode: boolean;
  active_simulations_count: number;
  active_rooms: string[];
  hardware_detected: boolean;
  timestamp: string;
}

export interface SensorConfig {
  id: string;
  owner_id: string;
  room_id: string;
  room_name: string;
  is_authorized: boolean;
  is_active: boolean;
  simulation_speed: number;
  retention_days: number;
  authorized_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SensorConfigCreate {
  room_id: string;
  room_name: string;
  is_authorized: boolean;
  simulation_speed?: number;
  retention_days?: number;
}

export interface SensorConfigUpdate {
  room_name?: string;
  is_authorized?: boolean;
  simulation_speed?: number;
  retention_days?: number;
}

export interface SimulationControlResponse {
  room_id: string;
  is_active: boolean;
  simulation_mode: boolean;
  action: 'started' | 'stopped' | 'reset' | string;
  speed: number;
  message: string;
}

export interface Esp32DetectedPort {
  port: string;
  description: string;
  hardware_id: string;
  is_likely_esp32: boolean;
}

export interface Esp32HardwareStatus {
  is_connected: boolean;
  is_streaming?: boolean;
  port: string;
  baud_rate: number;
  status:
    | 'disconnected'
    | 'port_available'
    | 'port_busy'
    | 'serial_connected'
    | 'waiting_for_packets'
    | 'receiving_csi'
    | 'processing_csi'
    | 'connecting'
    | 'error'
    | string;
  status_message: string;
  packets_captured: number;
  packets_per_second: number;
  malformed_packets: number;
  last_packet_time?: string | null;
  last_error?: string | null;
  wifi_status?: string | null;
  last_firmware_log?: string | null;
  device_description?: string | null;
  detected_ports: Esp32DetectedPort[];
  calibration_status?: string;
  is_calibrated?: boolean;
  baseline_variance?: number | null;
  presence_state?: string | null;
  current_state?: string | null;
  presence_probability?: number | null;
  motion_intensity?: number | null;
  rssi_dbm?: number | null;
  subcarrier_count?: number | null;
  subcarrier_amplitudes?: number[] | null;
  estimated_x?: number | null;
  estimated_y?: number | null;
  velocity_mps?: number | null;
  occupant_count?: number | null;
  occupants?: Array<Record<string, unknown>> | null;
}

export interface SensingEvent {
  id: string;
  room_id: string;
  timestamp: string;
  is_simulated: boolean;
  sensor_type: string;
  presence_state: 'vacant' | 'presence' | 'motion' | 'unknown' | string;
  presence_probability?: number | null;
  motion_level: 'none' | 'low' | 'medium' | 'high' | string;
  signal_strength_dbm: number;
  sample_count: number;
  quality_score: number;
  estimated_x?: number | null;
  estimated_y?: number | null;
  velocity_mps?: number | null;
  uncertainty_radius_m?: number | null;
  fresnel_region?: {
    tx_pos: [number, number];
    rx_pos: [number, number];
    center_pos: [number, number];
    semi_major_axis_m: number;
    semi_minor_axis_m: number;
    angle_rad: number;
    uncertainty_level: string;
  } | null;
  subject_id?: string | null;
  raw_metrics: Record<string, unknown>;
}

export interface AnchorConfig {
  id: string;
  role: 'transmitter' | 'receiver';
  x_m: number;
  y_m: number;
  label: string;
}

export interface ObstacleConfig {
  id: string;
  type: 'desk' | 'sofa' | 'door' | 'window' | 'wall' | 'plant' | string;
  x_m: number;
  y_m: number;
  width_m: number;
  length_m: number;
  label: string;
}

export interface CalibrationProfile {
  room_width_m: number;
  room_length_m: number;
  anchors: AnchorConfig[];
  obstacles: ObstacleConfig[];
  empty_room_baseline?: Record<string, unknown> | null;
  is_hardware_calibrated: boolean;
  calibrated_at?: string | null;
}

export interface BaselineCalibrationResult {
  noise_floor_dbm: number;
  ambient_variance: number;
  baseline_rssi_dbm: number;
  calibrated_at: string;
  sample_duration_seconds: number;
  is_hardware_calibrated: boolean;
  calibration_status: string;
  provider_id: string;
}

export interface SensingEventListResponse {
  events: SensingEvent[];
  total: number;
  room_id?: string | null;
  simulation_mode: boolean;
}

export interface SensingOccupancySummary {
  room_id: string;
  is_simulated: boolean;
  total_events: number;
  current_state: string;
  current_probability?: number | null;
  average_signal_dbm: number;
  state_breakdown: Record<string, number>;
  last_event_time?: string | null;
}

export interface SensingPurgeResponse {
  purged_count: number;
  message: string;
}

export interface WifiSensingAudit {
  id: string;
  owner_id: string;
  room_id?: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// Phase 9: Unified AI Orchestration Engine Types

export type WorkflowStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'waiting_for_input'
  | 'waiting_for_confirmation'
  | 'partially_completed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting_for_confirmation'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface WorkflowStep {
  id: string;
  step_number: number;
  title: string;
  capability: string;
  parameters?: Record<string, unknown>;
  depends_on: number[];
  is_consequential: boolean;
  consequential_reason?: string | null;
  requires_confirmation: boolean;
  confirmed_by_user?: boolean | null;
  status: WorkflowStepStatus;
  retry_count: number;
  max_retries: number;
  output_data?: Record<string, unknown> | null;
  citations?: Array<{
    source_type: string;
    citation_key: string;
    title?: string;
    url?: string;
    snippet?: string;
    is_simulated?: boolean;
    disclaimer?: string;
  }>;
  is_simulated: boolean;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WorkflowPlan {
  summary: string;
  steps: Array<{
    step_number: number;
    title: string;
    capability: string;
    parameters: Record<string, unknown>;
    depends_on: number[];
    is_consequential: boolean;
    consequential_reason?: string | null;
    requires_confirmation: boolean;
  }>;
  estimated_duration_seconds?: number;
  consequential_actions_count: number;
}

export interface Workflow {
  id: string;
  owner_id: string;
  conversation_id?: string | null;
  title: string;
  request_prompt: string;
  status: WorkflowStatus;
  plan_version: number;
  plan?: WorkflowPlan | null;
  context_data?: Record<string, unknown> | null;
  clarification_question?: string | null;
  clarification_response?: string | null;
  pending_confirmation?: {
    step_id: string;
    step_number: number;
    title: string;
    capability: string;
    parameters?: Record<string, unknown>;
    consequential_reason?: string;
  } | null;
  result_summary?: string | null;
  final_report?: {
    title: string;
    status: string;
    steps_count: number;
    citations?: Array<{
      source_type: string;
      citation_key: string;
      title?: string;
      url?: string;
      snippet?: string;
      is_simulated?: boolean;
    }>;
    summary: string;
    completed_at?: string;
  } | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  steps: WorkflowStep[];
}

export interface WorkflowListResponse {
  items: Workflow[];
  total: number;
}

export interface WorkflowEvent {
  id: string;
  workflow_id: string;
  step_id?: string | null;
  event_type: string;
  message: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkflowCreateRequest {
  prompt: string;
  conversation_id?: string | null;
  auto_approve?: boolean;
  file_ids?: string[];
}

export interface WorkflowApproveRequest {
  approved: boolean;
  modified_plan?: WorkflowPlan | null;
  plan_version: number;
}

export interface WorkflowClarifyRequest {
  clarification_response: string;
}

export interface WorkflowConfirmStepRequest {
  step_number: number;
  approved: boolean;
  reason?: string | null;
}

export interface WorkflowCancelRequest {
  reason?: string;
}

export interface RetentionStatusResponse {
  policy: string;
  retention_period_hours: number;
  active_conversations_count: number;
  active_files_count: number;
  storage_bytes_used: number;
  sensing_events_count: number;
  earliest_data_expiry: string | null;
  current_time_utc: string;
  auto_cleanup_active: boolean;
}

export interface RetentionCleanupResponse {
  message: string;
  results: {
    expired_conversations: number;
    expired_files: number;
    physical_files_deleted: number;
    expired_sensing_events: number;
    expired_browser_tasks: number;
    expired_research_jobs: number;
    expired_workflows: number;
  };
}

export interface RetentionPurgeResponse {
  message: string;
  results: {
    purged_conversations: number;
    purged_files: number;
    physical_files_deleted: number;
    purged_sensing_events: number;
    purged_browser_tasks: number;
    purged_research_jobs: number;
    purged_workflows: number;
  };
}
