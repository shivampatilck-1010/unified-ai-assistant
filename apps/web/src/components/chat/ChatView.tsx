import { useRef, useEffect, useState } from 'react';
import type { ChatMessage, ModelInfo } from '../../types';
import { Composer } from '../composer/Composer';
import { MarkdownContent } from './MarkdownContent';
import './ChatView.css';

interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (
    message: string,
    provider?: string | null,
    model?: string | null,
    useKnowledge?: boolean,
    selectedFileIds?: string[],
    useResearch?: boolean,
    researchDepth?: string,
    useOrchestration?: boolean
  ) => void;
  onRetry?: (messageId: string, provider?: string | null, model?: string | null) => void;
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
  onRetry,
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

  const [useResearch, setUseResearch] = useState(false);
  const [useOrchestration, setUseOrchestration] = useState(false);
  const currentModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0];

  const handleSend = (text: string) => {
    onSend(text, currentModel?.provider, currentModel?.id, false, undefined, useResearch, 'standard', useOrchestration);
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`chat-view__orchestration-toggle ${useOrchestration ? 'chat-view__orchestration-toggle--active' : ''}`}
            onClick={() => setUseOrchestration((v) => !v)}
            title="Coordinate multi-step planning, capabilities, and execution"
            type="button"
            style={{
              background: useOrchestration ? '#3b1d5c' : '#262626',
              border: `1px solid ${useOrchestration ? '#a855f7' : '#3d3d3d'}`,
              color: useOrchestration ? '#e9d5ff' : '#a3a3a3',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Orchestrate</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>{useOrchestration ? 'ON' : 'OFF'}</span>
          </button>

          <button
            className={`chat-view__research-toggle ${useResearch ? 'chat-view__research-toggle--active' : ''}`}
            onClick={() => setUseResearch((v) => !v)}
            title="Ground answers in live web research"
            type="button"
            style={{
              background: useResearch ? '#1e3a5f' : '#262626',
              border: `1px solid ${useResearch ? '#3b82f6' : '#3d3d3d'}`,
              color: useResearch ? '#93c5fd' : '#a3a3a3',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Web Research</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>{useResearch ? 'ON' : 'OFF'}</span>
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
              <span>Connecting to AI gateway...</span>
            </div>
          )}
        </div>
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
                    <path d="M4 2h7l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 2v4h4" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                Files & Knowledge RAG engine (Phase 5)
              </div>
              <div className="chat-view__capability">
                <span className="chat-view__capability-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                Web Research & Browser Intelligence (Phase 6)
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-view__message-list">
            {messages.map((msg, idx) => {
              const isQuotaOrRawError = Boolean(
                msg.content && (
                  msg.content.includes('RESOURCE_EXHAUSTED') ||
                  msg.content.includes("'status': 'RESOURCE_EXHAUSTED'") ||
                  msg.content.includes('Quota exceeded')
                )
              );
              const isError = msg.isError || msg.status === 'error' || isQuotaOrRawError;

              return (
              <div
                key={msg.id}
                className={`chat-message chat-message--${msg.role} ${
                  isError ? 'chat-message--error' : ''
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
                  ) : isError ? (
                    <div className="chat-message__error-container">
                      <div className="chat-message__error-header">
                        <svg className="chat-message__error-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 4.5v4.5M8 11.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <span className="chat-message__error-title">
                          {msg.error_category === 'daily_quota_exhausted' || isQuotaOrRawError
                            ? 'Daily Quota Limit Reached'
                            : msg.error_code === 'RATE_LIMIT_EXCEEDED'
                            ? 'Usage Limit Reached'
                            : msg.error_code === 'AUTHENTICATION_FAILED'
                            ? 'Authentication Error'
                            : 'Generation Error'}
                        </span>
                      </div>
                      <div className="chat-message__error-text">
                        <MarkdownContent content={msg.content} isError />
                      </div>
                      <div className="chat-message__error-actions">
                        {onRetry && (
                          <button
                            type="button"
                            className="chat-message__retry-btn"
                            disabled={isStreaming}
                            onClick={() => onRetry(msg.id, currentModel?.provider, selectedModelId)}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <path d="M2.5 8a5.5 5.5 0 109.9-3.3M12.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Retry
                          </button>
                        )}
                        {availableModels.length > 1 && (
                          <span className="chat-message__switch-hint">
                            Switch models in the dropdown above to continue.
                          </span>
                        )}
                      </div>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    <MarkdownContent content={msg.content} />
                  ) : (
                    <span>{msg.content}</span>
                  )}
                  {msg.isStreaming && (
                    <span className="chat-message__cursor" aria-hidden="true" />
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="chat-message__citations">
                      <div className="chat-message__citations-header">Sources & Citations:</div>
                      <div className="chat-message__citations-list">
                        {msg.citations.map((c, i) => (
                          <span key={i} className="chat-message__citation-pill" title={c.snippet}>
                            [Doc: {c.filename}{c.page_number ? `, Page ${c.page_number}` : ''}]
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isError && (
                    <div className="chat-message__footer">
                      {msg.model && (
                        <div className="chat-message__meta">
                          Generated via {msg.model}
                        </div>
                      )}
                      {msg.role === 'assistant' && !msg.isStreaming && (
                        <div className="chat-message__actions">
                          <button
                            type="button"
                            className="chat-message__action-btn"
                            title="Copy response to clipboard"
                            onClick={() => void navigator.clipboard.writeText(msg.content)}
                          >
                            Copy
                          </button>
                          {onRetry && idx === messages.length - 1 && (
                            <button
                              type="button"
                              className="chat-message__action-btn"
                              title="Regenerate this response"
                              disabled={isStreaming}
                              onClick={() => onRetry(msg.id, currentModel?.provider, selectedModelId)}
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
            })}
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
