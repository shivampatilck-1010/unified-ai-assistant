import { useState, useCallback, useRef, useEffect } from 'react';
import type { ConversationSummary, ConversationDetail, ChatMessage, ChunkCitation, ErrorData } from '../types';
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
} from '../lib/api';
import { streamChat } from '../lib/streaming';

export function useConversations(backendConnected: boolean = true) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Load conversation list from backend
  const refreshList = useCallback(async () => {
    if (!backendConnected) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchConversations(50, 0);
      setConversations(res.items);
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

  // Load active conversation messages from backend
  const selectConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setIsStreaming(false);
      setActiveId(id);

      try {
        setIsLoading(true);
        const detail = await fetchConversation(id);
        setActiveConversation(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setIsLoading(false);
      }
    },
    []
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
      return created.id;
    } catch {
      // In case backend is unreachable, prepare local draft
      const tempId = crypto.randomUUID();
      setActiveId(tempId);
      setActiveConversation({
        id: tempId,
        owner_id: 'local',
        title: 'New conversation',
        project_id: projectId || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      });
      return tempId;
    }
  }, []);

  const rename = useCallback(async (id: string, newTitle: string) => {
    try {
      const updated = await apiRenameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
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
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete conversation');
      }
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
      targetAssistantId?: string
    ) => {
      const assistantMsgId = targetAssistantId || crypto.randomUUID();

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
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          created_at: new Date().toISOString(),
        };

        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          created_at: new Date().toISOString(),
          isStreaming: true,
        };

        // Optimistic update to current view
        setActiveConversation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: [...prev.messages, userMsg, assistantMsg],
          };
        });
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        await streamChat(
          {
            conversation_id: activeId,
            message: content,
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
                if (!prev) return null;
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: m.content + text } : m
                  ),
                };
              });
            },
            onMessageComplete: (_finishReason: string, citations?: ChunkCitation[]) => {
              setActiveConversation((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, isStreaming: false, citations } : m
                  ),
                };
              });
              setIsStreaming(false);
              void refreshList();
            },
            onError: (errData: ErrorData) => {
              setActiveConversation((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
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
                  ),
                };
              });
              setIsStreaming(false);
            },
            onStreamError: (streamErr: Error) => {
              setActiveConversation((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: `Connection error: ${streamErr.message}`,
                          isStreaming: false,
                          isError: true,
                        }
                      : m
                  ),
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
    [activeId, refreshList]
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
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        ),
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
    refreshList,
    selectConversation,
    startNewChat,
    renameConversation: rename,
    deleteConversation: deleteConv,
    sendMessage,
    retryMessage,
    cancelStream,
  };
}
