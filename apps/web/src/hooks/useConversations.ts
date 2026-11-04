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
  createConversation,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
} from '../lib/api';
import { streamChat } from '../lib/streaming';

const STORAGE_KEY_CONVS = 'unified_ai_conversations_v2';
const STORAGE_KEY_ACTIVE_ID = 'unified_ai_active_id_v2';
const STORAGE_PREFIX_MSGS = 'unified_ai_conv_messages_v2_';

function loadStoredConversations(): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONVS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredConversations(list: ConversationSummary[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CONVS, JSON.stringify(list));
  } catch {}
}

function loadStoredMessages(convId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_MSGS}${convId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredMessages(convId: string, msgs: ChatMessage[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX_MSGS}${convId}`, JSON.stringify(msgs));
  } catch {}
}

export function useConversations(backendConnected: boolean = true) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(() => {
    return loadStoredConversations();
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    const stored = loadStoredConversations();
    if (saved && stored.some((c) => c.id === saved)) return saved;
    return stored[0]?.id || null;
  });

  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
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

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Sync activeId to localStorage
  useEffect(() => {
    if (activeId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeId);
    }
  }, [activeId]);

  // Sync conversations list to localStorage
  useEffect(() => {
    if (conversations.length > 0) {
      saveStoredConversations(conversations);
    }
  }, [conversations]);

  // Load conversation list from backend and merge with local store
  const refreshList = useCallback(async () => {
    if (!backendConnected) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchConversations(50, 0);
      if (res.items && res.items.length > 0) {
        setConversations((prev) => {
          const map = new Map<string, ConversationSummary>();
          // Server items
          res.items.forEach((item) => map.set(item.id, item));
          // Local items (preserve local-first)
          prev.forEach((item) => {
            if (!map.has(item.id)) map.set(item.id, item);
          });
          const merged = Array.from(map.values());
          saveStoredConversations(merged);
          return merged;
        });
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
      abortRef.current?.abort();
      setIsStreaming(false);
      setActiveId(id);

      // Instant local cache restoration
      const cachedMsgs = loadStoredMessages(id);
      const summary = conversations.find((c) => c.id === id);
      if (cachedMsgs && cachedMsgs.length > 0) {
        setActiveConversation({
          id,
          owner_id: summary?.owner_id || 'default_user',
          title: summary?.title || 'Conversation',
          created_at: summary?.created_at || new Date().toISOString(),
          updated_at: summary?.updated_at || new Date().toISOString(),
          messages: cachedMsgs,
        });
      }

      try {
        setIsLoading(true);
        const detail = await fetchConversation(id);
        if (detail && detail.messages && detail.messages.length > 0) {
          setActiveConversation(detail);
          saveStoredMessages(id, detail.messages);
        }
      } catch (err) {
        // If server returns error, local cache remains displayed safely
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setIsLoading(false);
      }
    },
    [conversations]
  );

  const startNewChat = useCallback(async (projectId?: string | null) => {
    abortRef.current?.abort();
    setIsStreaming(false);

    try {
      const created = await createConversation('New conversation', projectId);
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      setActiveConversation({
        id: created.id,
        owner_id: created.owner_id,
        title: created.title,
        project_id: created.project_id,
        created_at: created.created_at,
        updated_at: created.updated_at,
        messages: [],
      });
      saveStoredMessages(created.id, []);
      return created.id;
    } catch {
      // Offline fallback
      const tempId = `conv-${Date.now()}`;
      setActiveId(tempId);
      const newDraft: ConversationDetail = {
        id: tempId,
        owner_id: 'default_user',
        title: 'New conversation',
        project_id: projectId || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      };
      setActiveConversation(newDraft);
      setConversations((prev) => [
        {
          id: tempId,
          owner_id: 'default_user',
          title: 'New conversation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: 0,
        },
        ...prev,
      ]);
      saveStoredMessages(tempId, []);
      return tempId;
    }
  }, []);

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
      localStorage.removeItem(`${STORAGE_PREFIX_MSGS}${id}`);
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
              c.id === effectiveConvId ? { ...c, updated_at: new Date().toISOString() } : c
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

      // Build complete conversation history so the model follows prior context
      const priorHistory: Array<{ role: string; content: string }> = (
        activeConversation?.messages || []
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

      const fullHistory = [...priorHistory, { role: 'user', content: content.trim() }];

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
              if (activeId !== conversationId) {
                setActiveId(conversationId);
              }
            },
            onTextDelta: (text: string) => {
              setActiveConversation((prev) => {
                if (!prev) {
                  return {
                    id: effectiveConvId,
                    owner_id: 'default_user',
                    title: content.slice(0, 32).trim() || 'New Chat',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    messages: [userMsg, { ...assistantMsg, content: text }],
                  };
                }
                const hasAssistantMsg = prev.messages.some((m) => m.id === assistantMsgId);
                const updatedMessages = hasAssistantMsg
                  ? prev.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: m.content + text } : m
                    )
                  : [...prev.messages, { ...assistantMsg, content: text }];
                return {
                  ...prev,
                  messages: updatedMessages,
                };
              });
            },
            onMessageComplete: (_finishReason: string, citations?: ChunkCitation[]) => {
              setActiveConversation((prev) => {
                if (!prev) return null;
                const nextMessages = prev.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false, citations } : m
                );
                saveStoredMessages(prev.id, nextMessages);
                return {
                  ...prev,
                  messages: nextMessages,
                };
              });
              setIsStreaming(false);
            },
            onError: (errData: ErrorData) => {
              setActiveConversation((prev) => {
                if (!prev) {
                  return {
                    id: effectiveConvId,
                    owner_id: 'default_user',
                    title: content.slice(0, 32).trim() || 'New Chat',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    messages: [
                      userMsg,
                      {
                        ...assistantMsg,
                        content: errData.message,
                        isStreaming: false,
                        isError: true,
                        error_code: errData.code,
                        error_category: errData.category,
                        retry_after: errData.retry_after,
                        retryable: errData.retryable,
                        routed_model: errData.routed_model,
                      },
                    ],
                  };
                }
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
                saveStoredMessages(prev.id, nextMessages);
                return {
                  ...prev,
                  messages: nextMessages,
                };
              });
              setIsStreaming(false);
            },
            onStreamError: (streamErr: Error) => {
              setActiveConversation((prev) => {
                if (!prev) {
                  return {
                    id: effectiveConvId,
                    owner_id: 'default_user',
                    title: content.slice(0, 32).trim() || 'New Chat',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    messages: [
                      userMsg,
                      {
                        ...assistantMsg,
                        content: `Connection error: ${streamErr.message}`,
                        isStreaming: false,
                        isError: true,
                      },
                    ],
                  };
                }
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
                saveStoredMessages(prev.id, nextMessages);
                return {
                  ...prev,
                  messages: nextMessages,
                };
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
  }, []);

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
