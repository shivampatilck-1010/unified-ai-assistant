import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ConversationSummary,
  ConversationDetail,
  ChatMessage,
  ChunkCitation,
  ErrorData,
  ChatAttachment,
} from '../types';
import {
  fetchConversations,
  fetchConversation,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
  getUserStoragePrefix,
  getStoredUser,
} from '../lib/api';
import { streamChat } from '../lib/streaming';

function getStorageKeys() {
  const prefix = getUserStoragePrefix();
  return {
    convs: `${prefix}conversations_v2`,
    activeId: `${prefix}active_id_v2`,
    msgPrefix: `${prefix}conv_messages_v2_`,
  };
}

function loadStoredConversations(): ConversationSummary[] {
  // If not authenticated, guest session has NO persistent recent conversations
  if (!getStoredUser()) {
    return [];
  }
  try {
    const { convs: key } = getStorageKeys();
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredConversations(list: ConversationSummary[]) {
  // Only persist recent conversations for authenticated accounts
  if (!getStoredUser()) return;
  try {
    const { convs: key } = getStorageKeys();
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

function loadStoredMessages(convId: string): ChatMessage[] {
  try {
    const { msgPrefix } = getStorageKeys();
    const raw = localStorage.getItem(`${msgPrefix}${convId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function sanitizeMessagesForStorage(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((m) => {
    if (!m.attachments || m.attachments.length === 0) return m;
    return {
      ...m,
      attachments: m.attachments.map((a) => {
        // Strip large base64 data (>30KB) to prevent hitting browser 5MB localStorage limit
        if (a.data && a.data.length > 30000) {
          return {
            ...a,
            data: a.previewUrl || '',
          };
        }
        return a;
      }),
    };
  });
}

function saveStoredMessages(convId: string, msgs: ChatMessage[]) {
  if (!convId || !getStoredUser()) return;
  try {
    const { msgPrefix } = getStorageKeys();
    const sanitized = sanitizeMessagesForStorage(msgs);
    localStorage.setItem(`${msgPrefix}${convId}`, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('LocalStorage save failed, recovering quota:', err);
    try {
      const { msgPrefix } = getStorageKeys();
      const convs = loadStoredConversations();
      if (convs.length > 3) {
        const oldest = [...convs].reverse().slice(0, 3);
        oldest.forEach((c) => {
          if (c.id !== convId) {
            localStorage.removeItem(`${msgPrefix}${c.id}`);
          }
        });
        localStorage.setItem(
          `${msgPrefix}${convId}`,
          JSON.stringify(sanitizeMessagesForStorage(msgs))
        );
      }
    } catch {}
  }
}

export function useConversations(backendConnected: boolean = true) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(() => {
    return loadStoredConversations();
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    const { activeId: activeKey } = getStorageKeys();
    const saved = localStorage.getItem(activeKey);
    const stored = loadStoredConversations();
    if (saved && stored.some((c) => c.id === saved)) return saved;
    return stored[0]?.id || null;
  });

  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(() => {
    const { activeId: activeKey } = getStorageKeys();
    const saved = localStorage.getItem(activeKey);
    const stored = loadStoredConversations();
    const effectiveId = saved || stored[0]?.id;
    if (effectiveId) {
      const msgs = loadStoredMessages(effectiveId);
      const match = stored.find((c) => c.id === effectiveId);
      return {
        id: effectiveId,
        owner_id: match?.owner_id || 'default_user',
        title: match?.title || 'Conversation',
        project_id: match?.project_id || undefined,
        created_at: match?.created_at || new Date().toISOString(),
        updated_at: match?.updated_at || new Date().toISOString(),
        messages: msgs,
      };
    }
    return null;
  });

  const activeConversationRef = useRef(activeConversation);
  activeConversationRef.current = activeConversation;

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const deltaBufferRef = useRef<string>('');
  const streamRafIdRef = useRef<number | null>(null);
  const streamSaveTimerRef = useRef<number | null>(null);

  const flushPendingDeltas = useCallback((targetAssistantId?: string) => {
    if (streamRafIdRef.current !== null) {
      cancelAnimationFrame(streamRafIdRef.current);
      streamRafIdRef.current = null;
    }
    if (streamSaveTimerRef.current !== null) {
      clearTimeout(streamSaveTimerRef.current);
      streamSaveTimerRef.current = null;
    }
    const remaining = deltaBufferRef.current;
    if (!remaining) return;
    deltaBufferRef.current = '';

    setActiveConversation((prev) => {
      if (!prev) return null;
      const updatedMessages = prev.messages.map((m) =>
        (targetAssistantId ? m.id === targetAssistantId : m.isStreaming)
          ? { ...m, content: m.content + remaining }
          : m
      );
      saveStoredMessages(prev.id, updatedMessages);
      const nextConv = { ...prev, messages: updatedMessages };
      activeConversationRef.current = nextConv;
      return nextConv;
    });
  }, []);

  // Sync activeId to user-scoped localStorage
  useEffect(() => {
    if (activeId) {
      const { activeId: key } = getStorageKeys();
      localStorage.setItem(key, activeId);
    }
  }, [activeId]);

  // Sync conversations list to user-scoped localStorage
  useEffect(() => {
    saveStoredConversations(conversations);
  }, [conversations]);

  // Listen for login/logout/account-switch events to cleanly swap user conversations
  useEffect(() => {
    const handleAuthChange = (event: Event) => {
      const customEvt = event as CustomEvent<{ user: unknown }>;
      const isLoggingOut = customEvt?.detail ? !customEvt.detail.user : !getStoredUser();

      if (isLoggingOut) {
        // Complete clean state on logout: no conversation loaded, zero messages
        setConversations([]);
        setActiveId(null);
        setActiveConversation(null);
        return;
      }

      const freshConvs = loadStoredConversations();
      setConversations(freshConvs);
      const { activeId: key } = getStorageKeys();
      const savedActive = localStorage.getItem(key);
      const nextId = (savedActive && freshConvs.some((c) => c.id === savedActive))
        ? savedActive
        : freshConvs[0]?.id || null;
      setActiveId(nextId);
      if (nextId) {
        const cached = loadStoredMessages(nextId);
        setActiveConversation({
          id: nextId,
          owner_id: freshConvs.find((c) => c.id === nextId)?.owner_id || 'default_user',
          title: freshConvs.find((c) => c.id === nextId)?.title || 'Conversation',
          created_at: freshConvs.find((c) => c.id === nextId)?.created_at || new Date().toISOString(),
          updated_at: freshConvs.find((c) => c.id === nextId)?.updated_at || new Date().toISOString(),
          messages: cached,
        });
      } else {
        setActiveConversation(null);
      }
      if (backendConnected) {
        void fetchConversations(50, 0)
          .then((res) => {
            if (res.items) {
              setConversations(res.items);
              saveStoredConversations(res.items);
              if (res.items.length > 0 && !nextId) {
                const firstId = res.items[0].id;
                setActiveId(firstId);
                const cached = loadStoredMessages(firstId);
                setActiveConversation({
                  id: firstId,
                  owner_id: res.items[0].owner_id || 'default_user',
                  title: res.items[0].title || 'Conversation',
                  created_at: res.items[0].created_at || new Date().toISOString(),
                  updated_at: res.items[0].updated_at || new Date().toISOString(),
                  messages: cached,
                });
              }
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('unified-ai-auth-change', handleAuthChange);
    return () => window.removeEventListener('unified-ai-auth-change', handleAuthChange);
  }, [backendConnected]);

  // Load conversation list from backend and merge with local store
  const refreshList = useCallback(async () => {
    if (!backendConnected) return;
    if (!getStoredUser()) {
      setConversations([]);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchConversations(50, 0);
      if (res.items) {
        setConversations(res.items);
        saveStoredConversations(res.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setIsLoading(false);
    }
  }, [backendConnected]);

  useEffect(() => {
    if (backendConnected) {
      void refreshList();
    }
  }, [backendConnected, refreshList]);

  // Select active conversation: Instant restore from localStorage, then verify with backend
  const selectConversation = useCallback(
    async (id: string) => {
      if (!id) return;

      // 1. Immediately abort active stream so it cannot pollute the new conversation
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setIsStreaming(false);

      // 2. Flush and persist previous conversation state
      flushPendingDeltas();
      if (activeConversationRef.current) {
        const cur = activeConversationRef.current;
        const finalized = cur.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        );
        saveStoredMessages(cur.id, finalized);
      }

      // 3. Immediately set active ID
      setActiveId(id);
      try {
        localStorage.setItem(getStorageKeys().activeId, id);
      } catch {}

      // 4. Synchronously load and render selected chat from localStorage (instant 0ms switch)
      const cachedMsgs = loadStoredMessages(id);
      const summary = conversations.find((c) => c.id === id);
      const resolvedTitle =
        summary?.title && summary.title !== 'Conversation' ? summary.title : 'Conversation';

      const initialDetail: ConversationDetail = {
        id,
        owner_id: summary?.owner_id || 'default_user',
        title: resolvedTitle,
        project_id: summary?.project_id || undefined,
        created_at: summary?.created_at || new Date().toISOString(),
        updated_at: summary?.updated_at || new Date().toISOString(),
        messages: cachedMsgs || [],
      };
      setActiveConversation(initialDetail);
      activeConversationRef.current = initialDetail;

      // 5. Non-destructive background server reconciliation
      try {
        setIsLoading(true);
        const detail = await fetchConversation(id);
        if (detail && detail.id === id) {
          const freshLocalMsgs = loadStoredMessages(id);
          const serverMsgs = Array.isArray(detail.messages) ? detail.messages : [];
          // Preserve whichever source has richer message history
          const chosenMsgs =
            serverMsgs.length > freshLocalMsgs.length ? serverMsgs : freshLocalMsgs;

          setActiveConversation((prev) => {
            // Guard: ensure user hasn't switched away to another chat while fetching
            if (!prev || prev.id !== id) return prev;
            const finalTitle =
              (detail.title && detail.title !== 'Conversation' && detail.title !== 'New Chat'
                ? detail.title
                : null) ||
              (summary?.title && summary.title !== 'Conversation' ? summary.title : null) ||
              prev.title;

            const nextDetail = {
              ...detail,
              title: finalTitle,
              messages: chosenMsgs,
            };
            activeConversationRef.current = nextDetail;
            return nextDetail;
          });

          if (chosenMsgs.length > 0) {
            saveStoredMessages(id, chosenMsgs);
          }
        }
      } catch {
        // Local cache remains intact
      } finally {
        setIsLoading(false);
      }
    },
    [conversations, flushPendingDeltas]
  );

  const startNewChat = useCallback((projectId?: string | null) => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    flushPendingDeltas();

    if (activeConversationRef.current) {
      const cur = activeConversationRef.current;
      const finalized = cur.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      );
      saveStoredMessages(cur.id, finalized);
    }

    const newDraftId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setActiveId(newDraftId);
    try {
      localStorage.setItem(getStorageKeys().activeId, newDraftId);
    } catch {}

    const initialDetail: ConversationDetail = {
      id: newDraftId,
      owner_id: 'default_user',
      title: 'New conversation',
      project_id: projectId || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
    };
    setActiveConversation(initialDetail);
    activeConversationRef.current = initialDetail;
    saveStoredMessages(newDraftId, []);

    setConversations((prev) => {
      const nextList = [
        {
          id: newDraftId,
          owner_id: 'default_user',
          title: 'New conversation',
          project_id: projectId || undefined,
          created_at: initialDetail.created_at,
          updated_at: initialDetail.updated_at,
          message_count: 0,
        },
        ...prev.filter((c) => c.id !== newDraftId),
      ];
      saveStoredConversations(nextList);
      return nextList;
    });

    return newDraftId;
  }, [flushPendingDeltas]);

  const rename = useCallback(async (id: string, newTitle: string) => {
    try {
      const updated = await apiRenameConversation(id, newTitle);
      setConversations((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c));
        saveStoredConversations(next);
        return next;
      });
      setActiveConversation((prev) =>
        prev && prev.id === id ? { ...prev, title: updated.title } : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename conversation');
    }
  }, []);

  const deleteConv = useCallback(
    async (id: string) => {
      if (id === activeId) {
        abortRef.current?.abort();
        setIsStreaming(false);
        setActiveConversation(null);
        setActiveId(null);
      }
      try {
        await apiDeleteConversation(id);
      } catch {
        // Fallback
      }
      localStorage.removeItem(`${getStorageKeys().msgPrefix}${id}`);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        saveStoredConversations(next);
        return next;
      });
    },
    [activeId]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      provider?: string | null,
      model?: string | null,
      useKnowledge?: boolean,
      selectedFileIds?: string[],
      useResearch?: boolean,
      researchDepth?: string,
      useOrchestration?: boolean,
      attachments?: ChatAttachment[],
      targetAssistantId?: string
    ) => {
      const assistantMsgId = targetAssistantId || crypto.randomUUID();
      const effectiveConvId = activeId || `conv-${Date.now()}`;
      if (!activeId) {
        setActiveId(effectiveConvId);
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        created_at: new Date().toISOString(),
        attachments,
      };

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
        isStreaming: true,
      };

      if (targetAssistantId) {
        // Retrying into an existing assistant message bubble without duplicating messages
        setActiveConversation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === targetAssistantId
                ? {
                    ...m,
                    content: '',
                    isStreaming: true,
                    isError: false,
                    error_code: undefined,
                    error_category: undefined,
                    retry_after: undefined,
                    retryable: undefined,
                    routed_model: undefined,
                  }
                : m
            ),
          };
        });
      } else {
        // Optimistic update to current view - initialize conversation if prev is null
        setActiveConversation((prev) => {
          if (!prev) {
            const initialDetail = {
              id: effectiveConvId,
              owner_id: 'default_user',
              title: content.slice(0, 32).trim() || 'New Chat',
              project_id: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [userMsg, assistantMsg],
            };
            saveStoredMessages(effectiveConvId, initialDetail.messages);
            return initialDetail;
          }
          const nextDetail = {
            ...prev,
            messages: [...prev.messages, userMsg, assistantMsg],
          };
          saveStoredMessages(effectiveConvId, nextDetail.messages);
          return nextDetail;
        });

        // Add to sidebar conversation list
        setConversations((prev) => {
          const nextTitle = content.slice(0, 32).trim() || 'New Chat';
          if (prev.some((c) => c.id === effectiveConvId)) {
            const nextList = prev.map((c) =>
              c.id === effectiveConvId
                ? {
                    ...c,
                    title:
                      c.title === 'New conversation' || c.title === 'Conversation'
                        ? nextTitle
                        : c.title,
                    updated_at: new Date().toISOString(),
                  }
                : c
            );
            saveStoredConversations(nextList);
            return nextList;
          }
          const nextList = [
            {
              id: effectiveConvId,
              owner_id: 'default_user',
              title: nextTitle,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 2,
            },
            ...prev,
          ];
          saveStoredConversations(nextList);
          return nextList;
        });
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      // Build strictly isolated conversation history for this conversation only
      const priorHistory: Array<{ role: string; content: string }> = (
        activeConversation && activeConversation.id === effectiveConvId
          ? activeConversation.messages
          : []
      )
        .filter(
          (m) =>
            !m.isError &&
            Boolean(m.content && m.content.trim()) &&
            m.id !== assistantMsgId &&
            m.id !== userMsg.id
        )
        .map((m) => ({
          role: m.role,
          content: m.content.trim(),
        }));

      // Sliding context window: limit to the last 6 messages (3 dialogue turns)
      // to keep recent context fresh and prevent token overflows on provider TPM limits
      const boundedPriorHistory = priorHistory.slice(-6);
      const fullHistory = [...boundedPriorHistory, { role: 'user', content: content.trim() }];

      try {
        await streamChat(
          {
            conversation_id: effectiveConvId,
            message: content,
            messages: fullHistory,
            attachments,
            provider: provider || undefined,
            model: model || undefined,
            use_knowledge: useKnowledge,
            selected_file_ids: selectedFileIds,
            use_research: useResearch,
            research_depth: researchDepth,
            use_orchestration: useOrchestration,
            project_id: activeConversation?.project_id || undefined,
          },
          {
            onMessageStart: (conversationId: string) => {
              if (controller.signal.aborted) return;
              if (activeId !== conversationId) {
                setActiveId(conversationId);
              }
            },
            onTextDelta: (text: string) => {
              if (controller.signal.aborted) return;
              deltaBufferRef.current += text;

              // Schedule 60fps render update
              if (streamRafIdRef.current === null) {
                streamRafIdRef.current = requestAnimationFrame(() => {
                  streamRafIdRef.current = null;
                  if (controller.signal.aborted) return;
                  const chunk = deltaBufferRef.current;
                  if (!chunk) return;
                  deltaBufferRef.current = '';

                  setActiveConversation((prev) => {
                    if (!prev || prev.id !== effectiveConvId) return prev;
                    const hasAssistantMsg = prev.messages.some((m) => m.id === assistantMsgId);
                    const updatedMessages = hasAssistantMsg
                      ? prev.messages.map((m) =>
                          m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
                        )
                      : [...prev.messages, { ...assistantMsg, content: chunk }];

                    const nextConv = { ...prev, messages: updatedMessages };
                    activeConversationRef.current = nextConv;
                    return nextConv;
                  });
                });
              }

              // Throttled background persistence to localStorage (at most once every 1200ms)
              if (streamSaveTimerRef.current === null) {
                streamSaveTimerRef.current = window.setTimeout(() => {
                  streamSaveTimerRef.current = null;
                  if (controller.signal.aborted) return;
                  if (
                    activeConversationRef.current &&
                    activeConversationRef.current.id === effectiveConvId
                  ) {
                    saveStoredMessages(effectiveConvId, activeConversationRef.current.messages);
                  }
                }, 1200);
              }
            },
            onMessageComplete: (_finishReason: string, citations?: ChunkCitation[]) => {
              if (controller.signal.aborted) return;
              flushPendingDeltas(assistantMsgId);
              setActiveConversation((prev) => {
                if (!prev || prev.id !== effectiveConvId) return prev;
                const nextMessages = prev.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false, citations } : m
                );
                saveStoredMessages(effectiveConvId, nextMessages);
                const nextConv = { ...prev, messages: nextMessages };
                activeConversationRef.current = nextConv;
                return nextConv;
              });
              setIsStreaming(false);
            },
            onError: (errData: ErrorData) => {
              if (controller.signal.aborted) return;
              flushPendingDeltas(assistantMsgId);
              setActiveConversation((prev) => {
                if (!prev || prev.id !== effectiveConvId) return prev;
                const nextMessages = prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: errData.message,
                        isStreaming: false,
                        isError: true,
                        error_code: errData.code,
                        error_category: errData.category,
                        retry_after: errData.retry_after,
                        retryable: errData.retryable,
                        routed_model: errData.routed_model,
                      }
                    : m
                );
                saveStoredMessages(effectiveConvId, nextMessages);
                const nextConv = { ...prev, messages: nextMessages };
                activeConversationRef.current = nextConv;
                return nextConv;
              });
              setIsStreaming(false);
            },
            onStreamError: (streamErr: Error) => {
              if (controller.signal.aborted) return;
              setActiveConversation((prev) => {
                if (!prev || prev.id !== effectiveConvId) return prev;
                const nextMessages = prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: `Connection error: ${streamErr.message}`,
                        isStreaming: false,
                        isError: true,
                      }
                    : m
                );
                saveStoredMessages(effectiveConvId, nextMessages);
                const nextConv = { ...prev, messages: nextMessages };
                activeConversationRef.current = nextConv;
                return nextConv;
              });
              setIsStreaming(false);
            },
          },
          controller.signal
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeId, activeConversation]
  );

  const retryMessage = useCallback(
    async (failedMsgId: string, provider?: string | null, model?: string | null) => {
      if (!activeConversation) return;
      const idx = activeConversation.messages.findIndex((m) => m.id === failedMsgId);
      if (idx <= 0) return;
      const userMsg = activeConversation.messages[idx - 1];
      if (userMsg.role !== 'user') return;

      await sendMessage(
        userMsg.content,
        provider,
        model,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        userMsg.attachments,
        failedMsgId
      );
    },
    [activeConversation, sendMessage]
  );

  const cancelStream = useCallback(() => {
    flushPendingDeltas();
    abortRef.current?.abort();
    setIsStreaming(false);
    setActiveConversation((prev) => {
      if (!prev) return null;
      const nextMessages = prev.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      );
      saveStoredMessages(prev.id, nextMessages);
      return {
        ...prev,
        messages: nextMessages,
      };
    });
  }, [flushPendingDeltas]);

  return {
    conversations,
    activeConversation,
    activeId,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    retryMessage,
    cancelStream,
    selectConversation,
    startNewChat,
    renameConversation: rename,
    deleteConversation: deleteConv,
    refreshList,
  };
}
