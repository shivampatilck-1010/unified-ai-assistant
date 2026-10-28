import { useRef, useEffect } from 'react';
import type { ChatMessage, ModelInfo } from '../../types';
import { Composer } from '../composer/Composer';
import './ChatView.css';

interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (message: string, provider?: string | null, model?: string | null) => void;
  isStreaming: boolean;
  onCancel: () => void;
  onNewChat: () => void;
  availableModels?: ModelInfo[];
  selectedModelId?: string | null;
  onSelectModel?: (modelId: string) => void;
}

export function ChatView({
  messages,
  onSend,
  isStreaming,
  onCancel,
  onNewChat,
  availableModels = [],
  selectedModelId,
  onSelectModel,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Detect if user has scrolled up
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !isAtBottom;
  };

  // Auto-scroll on new messages, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  const currentModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0];

  const handleSend = (text: string) => {
    onSend(text, currentModel?.provider, currentModel?.id);
  };

  return (
    <div className="chat-view">
      {/* Top bar */}
      <div className="chat-view__topbar">
        <button
          className="chat-view__new-btn"
          onClick={onNewChat}
          aria-label="New conversation"
          title="New conversation"
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>New Chat</span>
        </button>

        {availableModels.length > 0 ? (
          <div className="chat-view__model-selector">
            <select
              className="chat-view__model-select"
              value={selectedModelId || availableModels[0]?.id}
              onChange={(e) => onSelectModel?.(e.target.value)}
              aria-label="Select AI Model"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="chat-view__model-unconfigured">
            <span>Model: Unconfigured</span>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div
        className="chat-view__messages"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {isEmpty ? (
          <div className="chat-view__empty">
            <div className="chat-view__empty-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="4" width="40" height="40" rx="12" stroke="currentColor" strokeWidth="2" />
                <path d="M16 24h16M24 16v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="chat-view__empty-title">Unified AI Assistant</h2>
            <p className="chat-view__empty-desc">
              Ask questions, analyze documents, design workflows, or explore ideas.
              Responses are streamed directly through the unified model gateway with full server persistence.
            </p>
            <div className="chat-view__empty-capabilities">
              <div className="chat-view__capability">
                <span className="chat-view__capability-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 14l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Server-persisted conversations & message history
              </div>
              <div className="chat-view__capability">
                <span className="chat-view__capability-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M4 2h10a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M6 8h6M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                Unified gateway (OpenAI, Anthropic, Google Gemini)
              </div>
              <div className="chat-view__capability">
                <span className="chat-view__capability-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M9 2a11 11 0 010 14M2 9h14" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </span>
                Autonomous browser agent (Phase 3)
              </div>
              <div className="chat-view__capability">
                <span className="chat-view__capability-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2 7a10 10 0 0114 0M4.5 10a6.5 6.5 0 019 0M7 13a3 3 0 014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="9" cy="15" r="1" fill="currentColor" />
                  </svg>
                </span>
                Wi-Fi presence sensing (Phase 5)
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-view__message-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message chat-message--${msg.role} ${
                  msg.isError || msg.status === 'error' ? 'chat-message--error' : ''
                } ${msg.isStreaming || msg.status === 'streaming' ? 'chat-message--streaming' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="chat-message__avatar" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="2" y="2" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M6 9h6M9 6v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div className="chat-message__content">
                  {msg.isStreaming && !msg.content ? (
                    <span className="chat-message__thinking">Thinking…</span>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                  {msg.isStreaming && (
                    <span className="chat-message__cursor" aria-hidden="true" />
                  )}
                  {msg.model && (
                    <div className="chat-message__meta">
                      Generated via {msg.model}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer
        onSend={handleSend}
        isStreaming={isStreaming}
        onCancel={onCancel}
      />
    </div>
  );
}
