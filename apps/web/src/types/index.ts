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
}

export interface ErrorData {
  code: string;
  message: string;
}

export interface ChatRequest {
  conversation_id: string | null;
  message: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export interface ProviderConfigStatus {
  configured: boolean;
  provider: string | null;
  message: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
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
