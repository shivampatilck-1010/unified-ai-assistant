import { useRef, useEffect, useState } from 'react';
import type { ChatMessage, ModelInfo } from '../../types';
import { Composer } from '../composer/Composer';
import { MarkdownContent } from './MarkdownContent';
import { BrowserLivePreviewCard } from '../browser/BrowserLivePreviewCard';
import { UnifiedLogo } from '../brand/UnifiedLogo';
import { FollowupEmailModal } from './FollowupEmailModal';
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
  conversationId?: string | null;
  conversationTitle?: string;
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
  conversationId,
  conversationTitle,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // States for interactive toolbar actions
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);

  // Detect if user has scrolled up
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 120;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !isAtBottom;
    setShowScrollBottomBtn(!isAtBottom);
  };

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    userScrolledUp.current = false;
    setShowScrollBottomBtn(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // High-performance auto-scroll follow-up during streaming and on new messages
  useEffect(() => {
    if (!userScrolledUp.current && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isStreaming]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isEmpty = messages.length === 0;

  const [useResearch, setUseResearch] = useState(false);
  const [useOrchestration, setUseOrchestration] = useState(false);
  const currentModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0];

  const handleSend = (text: string) => {
    onSend(text, currentModel?.provider, currentModel?.id, false, undefined, useResearch, 'standard', useOrchestration);
  };

  const handleCopy = (msgId: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleSpeak = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown before speaking
    const cleanText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/[#*`_~]/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleRating = (msgId: string, type: 'up' | 'down') => {
    setRatings((prev) => ({
      ...prev,
      [msgId]: prev[msgId] === type ? (undefined as unknown as 'up') : type,
    }));
  };

  const getActionBadge = (content: string, hasCitations: boolean, browserTaskId: string | null) => {
    if (
      content.includes('INT335_P24_chat_export.md') ||
      content.includes('file-card:') ||
      /(?:exported|saved|created)\s+(?:a\s+)?(?:file|doc)/i.test(content)
    ) {
      return 'Created a file, shared files ▸';
    }
    if (/!\[.*?\]\(https?:\/\//.test(content) || /generating image/i.test(content)) {
      return 'Created image artwork ▸';
    }
    if (browserTaskId) {
      return 'Automated browser execution ▸';
    }
    if (hasCitations) {
      return 'Searched web & documents ▸';
    }
    return null;
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

          <button
            className="chat-view__email-followup-btn"
            onClick={() => setShowEmailModal(true)}
            title="Dispatch conversation summary & takeaways via email"
            type="button"
            style={{
              background: '#1c2438',
              border: '1px solid #3b82f6',
              color: '#93c5fd',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>Follow-up Email</span>
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
            <div className="chat-view__empty-icon" aria-hidden="true" style={{ width: '68px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <UnifiedLogo size={68} animated />
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
            {messages.map((msg) => {
              const isQuotaOrRawError = Boolean(
                msg.content && (
                  msg.content.includes('RESOURCE_EXHAUSTED') ||
                  msg.content.includes("'status': 'RESOURCE_EXHAUSTED'") ||
                  msg.content.includes('Quota exceeded')
                )
              );
              const isError = msg.isError || msg.status === 'error' || isQuotaOrRawError;

              const browserTaskMatch = msg.content?.match(/<!--\s*browser-task:\s*([a-zA-Z0-9_-]+)\s*-->/);
              const browserTaskId = browserTaskMatch ? browserTaskMatch[1] : null;
              const cleanContent = msg.content
                ? msg.content.replace(/<!--\s*browser-task:\s*[a-zA-Z0-9_-]+\s*-->/g, '').trim()
                : '';

              const actionBadge = msg.role === 'assistant'
                ? getActionBadge(msg.content || '', Boolean(msg.citations && msg.citations.length > 0), browserTaskId)
                : null;

              return (
                <div
                  key={msg.id}
                  className={`chat-message chat-message--${msg.role} ${
                    isError ? 'chat-message--error' : ''
                  } ${msg.isStreaming || msg.status === 'streaming' ? 'chat-message--streaming' : ''}`}
                >
                  <div className="chat-message__content">
                    {/* Collapsible Action/Tool Summary Badge (Claude/ChatGPT style) */}
                    {actionBadge && (
                      <div className="chat-message__action-badge" title="Action summary">
                        <span>{actionBadge}</span>
                      </div>
                    )}

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
                      <>
                        {browserTaskId && (
                          <BrowserLivePreviewCard taskId={browserTaskId} compact />
                        )}
                        <MarkdownContent content={cleanContent} />
                      </>
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

                    {/* Sleek Action Footer matching reference design */}
                    {!isError && msg.role === 'assistant' && !msg.isStreaming && (
                      <div className="chat-message__footer">
                        {/* Minimalist Action Toolbar: Copy, Speaker, Thumbs Up, Thumbs Down, Regenerate */}
                        <div className="chat-message__toolbar">
                          {/* 1. Copy Icon */}
                          <button
                            type="button"
                            className="chat-message__tool-btn"
                            title={copiedId === msg.id ? 'Copied to clipboard!' : 'Copy response'}
                            onClick={() => handleCopy(msg.id, cleanContent || msg.content)}
                          >
                            {copiedId === msg.id ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>

                          {/* 2. Read Aloud / Speaker Icon */}
                          <button
                            type="button"
                            className={`chat-message__tool-btn ${speakingId === msg.id ? 'chat-message__tool-btn--speaking' : ''}`}
                            title={speakingId === msg.id ? 'Stop speaking' : 'Read aloud'}
                            onClick={() => handleToggleSpeak(msg.id, cleanContent || msg.content)}
                          >
                            {speakingId === msg.id ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                              </svg>
                            )}
                          </button>

                          {/* 3. Thumbs Up */}
                          <button
                            type="button"
                            className={`chat-message__tool-btn ${ratings[msg.id] === 'up' ? 'chat-message__tool-btn--active' : ''}`}
                            title="Good response"
                            onClick={() => handleRating(msg.id, 'up')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                            </svg>
                          </button>

                          {/* 4. Thumbs Down */}
                          <button
                            type="button"
                            className={`chat-message__tool-btn ${ratings[msg.id] === 'down' ? 'chat-message__tool-btn--active' : ''}`}
                            title="Bad response"
                            onClick={() => handleRating(msg.id, 'down')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                            </svg>
                          </button>

                          {/* 5. Regenerate */}
                          {onRetry && (
                            <button
                              type="button"
                              className="chat-message__tool-btn"
                              title="Regenerate response"
                              disabled={isStreaming}
                              onClick={() => onRetry(msg.id, currentModel?.provider, selectedModelId)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {msg.model && (
                          <div className="chat-message__meta">
                            {msg.model}
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

        {/* Floating Scroll to Bottom Button */}
        {showScrollBottomBtn && (
          <button
            type="button"
            className="chat-view__scroll-bottom-btn"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Scroll to bottom</span>
          </button>
        )}
      </div>

      {/* Composer */}
      <Composer
        onSend={handleSend}
        isStreaming={isStreaming}
        onCancel={onCancel}
      />

      {/* Follow-up Email Modal */}
      <FollowupEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        conversationId={conversationId ?? null}
        conversationTitle={conversationTitle}
      />
    </div>
  );
}
