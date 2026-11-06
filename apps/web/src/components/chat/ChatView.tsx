import { AgentStepsTray } from './AgentStepsTray';
import type { QueuedMessage } from '../composer/QueuedMessagesTray';
import { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage, ModelInfo, ChatAttachment } from '../../types';
import { Composer } from '../composer/Composer';
import { MarkdownContent } from './MarkdownContent';
import { BrowserLivePreviewCard } from '../browser/BrowserLivePreviewCard';
import { UnifiedLogo } from '../brand/UnifiedLogo';
import { CompanyLogo } from '../brand/CompanyLogo';
import { FollowupEmailModal } from './FollowupEmailModal';
import { ApiKeyModal } from '../auth/ApiKeyModal';
import { CouncilSetupModal } from './CouncilSetupModal';
import { CalendarReminderCard, type CalendarReminderData } from '../calendar/CalendarReminderCard';
import { detectCalendarIntent } from '../../utils/calendarIntentDetector';
import { exportMarkdownToPdf } from '../../utils/pdfExporter';
import { getCustomApiKey } from '../../lib/api';
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
    useOrchestration?: boolean,
    attachments?: ChatAttachment[]
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
  onNewChat: _onNewChat,
  availableModels = [],
  selectedModelId,
  onSelectModel,
  conversationId,
  conversationTitle,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  // States for interactive toolbar actions
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportedPdfId, setExportedPdfId] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [_hasCustomKey, setHasCustomKey] = useState<boolean>(Boolean(getCustomApiKey()));

  const handleExportPdf = (messageId: string, text: string) => {
    setExportedPdfId(messageId);
    exportMarkdownToPdf(text, {
      title: conversationTitle || 'Unified AI Assistant Export',
    });
    setTimeout(() => setExportedPdfId(null), 2500);
  };

  // Reset flag and scroll smoothly when requested
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    isUserScrolledUp.current = false;
    setShowScrollBottomBtn(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // Passive scroll listener: re-enable auto-scroll when user returns near the bottom
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom <= 120) {
      isUserScrolledUp.current = false;
      setShowScrollBottomBtn(false);
    }
  };

  // Wheel and touch listeners to detect TRUE intentional user scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // User physically scrolled up
        isUserScrolledUp.current = true;
        setShowScrollBottomBtn(true);
      } else if (e.deltaY > 0) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom <= 120) {
          isUserScrolledUp.current = false;
          setShowScrollBottomBtn(false);
        }
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY || 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY || 0;
      const deltaY = currentY - touchStartY;
      if (deltaY > 15) {
        // Swiping down = scrolling up
        isUserScrolledUp.current = true;
        setShowScrollBottomBtn(true);
      } else if (deltaY < -15) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom <= 120) {
          isUserScrolledUp.current = false;
          setShowScrollBottomBtn(false);
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const scrollRafRef = useRef<number | null>(null);

  const requestSmoothScrollToBottom = useCallback(() => {
    if (isUserScrolledUp.current || !containerRef.current) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = containerRef.current;
      if (!el || isUserScrolledUp.current) return;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom > 1) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  // Continuous smooth auto-scroll synchronized to 60fps frame rate
  useEffect(() => {
    requestSmoothScrollToBottom();
  }, [messages, isStreaming, requestSmoothScrollToBottom]);

  // ResizeObserver to track dynamic formula/KaTeX/image expansions smoothly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      requestSmoothScrollToBottom();
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [requestSmoothScrollToBottom]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isEmpty = messages.length === 0;

  const [useResearch, setUseResearch] = useState(() => {
    return localStorage.getItem('unified_ai_pref_research') === 'true';
  });
  const [useOrchestration, setUseOrchestration] = useState(() => {
    return localStorage.getItem('unified_ai_pref_orchestration') === 'true';
  });

  useEffect(() => {
    const handleSync = () => {
      setUseResearch(localStorage.getItem('unified_ai_pref_research') === 'true');
      setUseOrchestration(localStorage.getItem('unified_ai_pref_orchestration') === 'true');
    };
    window.addEventListener('chat-prefs-updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('chat-prefs-updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);
  const [pendingCalendarData, setPendingCalendarData] = useState<CalendarReminderData | null>(null);
  const [showCalendarCard, setShowCalendarCard] = useState(false);
  const [showCouncilModal, setShowCouncilModal] = useState(false);
  // Queued Messages System (sends after agent finishes working)
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [editPayload, setEditPayload] = useState<{ content: string; attachments?: ChatAttachment[] } | null>(null);

  const handleQueueMessage = (content: string, attachments?: ChatAttachment[]) => {
    const newItem: QueuedMessage = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content,
      attachments,
      timestamp: Date.now(),
    };
    setQueuedMessages((prev) => [...prev, newItem]);
  };

  const handleRemoveQueuedMessage = (id: string) => {
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSendQueuedMessageNow = (id: string) => {
    const msg = queuedMessages.find((m) => m.id === id);
    if (!msg) return;
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
    if (isStreaming) {
      onCancel();
    }
    setTimeout(() => {
      handleSend(msg.content, msg.attachments);
    }, 150);
  };

  const handleEditQueuedMessage = (id: string) => {
    const msg = queuedMessages.find((m) => m.id === id);
    if (!msg) return;
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
    setEditPayload({ content: msg.content, attachments: msg.attachments });
  };

  const prevStreamingRef = useRef(isStreaming);
  const currentModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0];

  // When the thinking process and model stream completes, pop up the calendar card in front
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      if (pendingCalendarData) {
        setShowCalendarCard(true);
      }
      // If messages are queued, auto-send next message
      if (queuedMessages.length > 0) {
        const nextMsg = queuedMessages[0];
        setQueuedMessages((prev) => prev.slice(1));
        setTimeout(() => {
          handleSend(nextMsg.content, nextMsg.attachments);
        }, 150);
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, pendingCalendarData, queuedMessages]);

  const handleSend = (text: string, attachments?: ChatAttachment[]) => {
    isUserScrolledUp.current = false;
    setShowScrollBottomBtn(false);

    // Detect if user is asking to schedule, remind, or set a task
    const detected = detectCalendarIntent(text);
    if (detected) {
      setPendingCalendarData(detected);
    }

    onSend(
      text,
      currentModel?.provider,
      currentModel?.id,
      false,
      undefined,
      useResearch,
      'standard',
      useOrchestration,
      attachments
    );
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });
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
      {/* Messages area */}
      <div
        className="chat-view__messages"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {isEmpty ? (
          <div className="chat-view__empty">
            <div className="chat-view__empty-icon" aria-hidden="true">
              <UnifiedLogo size={76} className="chat-view__hero-logo" />
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

              const prevUserMsg = messages
                .slice(0, messages.findIndex((m) => m.id === msg.id))
                .reverse()
                .find((m) => m.role === 'user');
              const promptContext = prevUserMsg?.content || '';

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

                    {msg.role === 'assistant' && !isError && (
                      <AgentStepsTray
                        isStreaming={Boolean(msg.isStreaming)}
                        promptText={promptContext}
                      />
                    )}

                    {msg.isStreaming && !msg.content ? null : isError ? (
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
                        <MarkdownContent
                          content={cleanContent}
                          onSelectChoice={(choice) => onSend(choice, currentModel?.provider, selectedModelId)}
                        />
                        {(cleanContent.includes('Anthropic API Key Required') ||
                          cleanContent.includes('Anthropic API key is required') ||
                          cleanContent.includes('OpenAI Direct Stream Notice')) && (
                          <div style={{ marginTop: '12px' }}>
                            <button
                              type="button"
                              onClick={() => setShowApiKeyModal(true)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                background: 'linear-gradient(135deg, #d97757, #b85d3f)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '8px',
                                padding: '7px 16px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(217, 119, 87, 0.3)',
                                transition: 'transform 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1.0)')}
                            >
                              <CompanyLogo
                                provider={cleanContent.includes('Anthropic') ? 'anthropic' : 'openai'}
                                size={14}
                              />
                              <span>
                                {cleanContent.includes('Anthropic')
                                  ? 'Configure Anthropic API Key in Settings'
                                  : 'Configure OpenAI API Key in Settings'}
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="chat-message__user-body">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="chat-message__attachments-grid">
                            {msg.attachments.map((att) => (
                              <div key={att.id} className="chat-message__attachment-item">
                                {att.previewUrl || (att.mimeType && att.mimeType.startsWith('image/')) ? (
                                  <img
                                    src={att.previewUrl || att.data}
                                    alt={att.name}
                                    className="chat-message__attachment-img"
                                  />
                                ) : (
                                  <div className="chat-message__attachment-file">
                                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                                      <path d="M4 2h5.5L13 5.5V14a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" />
                                      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.4" />
                                    </svg>
                                    <span>{att.name}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.content && <span>{msg.content}</span>}
                      </div>
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

                          {/* 2. Download / Export as PDF */}
                          <button
                            type="button"
                            className="chat-message__tool-btn"
                            title={exportedPdfId === msg.id ? 'PDF Print Dialog Opened' : 'Download as PDF / Print'}
                            onClick={() => handleExportPdf(msg.id, cleanContent || msg.content)}
                          >
                            {exportedPdfId === msg.id ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
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
            onClick={() => scrollToBottom()}
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
        queuedMessages={queuedMessages}
        onQueueMessage={handleQueueMessage}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onSendQueuedMessageNow={handleSendQueuedMessageNow}
        onEditQueuedMessage={handleEditQueuedMessage}
        editPayload={editPayload}
        onClearEditPayload={() => setEditPayload(null)}
      />

      {/* Follow-up Email Modal */}
      <FollowupEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        conversationId={conversationId ?? null}
        conversationTitle={conversationTitle}
      />

      {/* User Personal API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onKeyChange={(has) => setHasCustomKey(has)}
      />

      {/* AI Council Multi-Model Setup Modal */}
      <CouncilSetupModal
        isOpen={showCouncilModal}
        onClose={() => setShowCouncilModal(false)}
        availableModels={availableModels}
        selectedModelId={selectedModelId ?? null}
        onSelectModel={(id) => onSelectModel?.(id)}
      />

      {/* Smart Calendar & Tasks Reminder Card Modal */}
      <CalendarReminderCard
        isOpen={showCalendarCard}
        onClose={() => {
          setShowCalendarCard(false);
          setPendingCalendarData(null);
        }}
        initialData={pendingCalendarData}
      />
    </div>
  );
}
