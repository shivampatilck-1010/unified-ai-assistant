import { useState, useCallback, useRef, useEffect } from 'react';
import type { Conversation, ChatMessage } from '../types';
import {
  loadConversations,
  saveConversations,
  createConversation,
  deriveTitle,
  generateId,
} from '../lib/conversations';
import { streamChat } from '../lib/streaming';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist on change
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const startNewChat = useCallback(() => {
    // Cancel any in-progress stream
    abortRef.current?.abort();
    setIsStreaming(false);

    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    if (id === activeId) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      setActiveId(null);
    }
  }, [activeId]);

  const sendMessage = useCallback(
    async (content: string) => {
      let convId = activeId;

      // Create a conversation if none is active
      if (!convId) {
        const conv = createConversation();
        setConversations((prev) => [conv, ...prev]);
        setActiveId(conv.id);
        convId = conv.id;
      }

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      // Add user message
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const isFirst = c.messages.length === 0;
          return {
            ...c,
            messages: [...c.messages, userMessage],
            title: isFirst ? deriveTitle(content) : c.title,
            updatedAt: Date.now(),
          };
        })
      );

      // Cancel any existing stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      // Create placeholder assistant message
      const assistantMsgId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: [...c.messages, assistantMessage],
            updatedAt: Date.now(),
          };
        })
      );

      const currentConvId = convId;

      await streamChat(
        { conversation_id: currentConvId, message: content },
        {
          onMessageStart: () => {
            // Stream has begun — already have placeholder
          },
          onTextDelta: (text: string) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConvId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + text }
                      : m
                  ),
                };
              })
            );
          },
          onMessageComplete: () => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConvId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, isStreaming: false }
                      : m
                  ),
                  updatedAt: Date.now(),
                };
              })
            );
            setIsStreaming(false);
          },
          onError: (_code: string, message: string) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConvId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: message, isStreaming: false, isError: true }
                      : m
                  ),
                  updatedAt: Date.now(),
                };
              })
            );
          },
          onStreamError: (error: Error) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConvId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: `Unable to reach the server. ${error.message}`,
                          isStreaming: false,
                          isError: true,
                        }
                      : m
                  ),
                  updatedAt: Date.now(),
                };
              })
            );
            setIsStreaming(false);
          },
        },
        controller.signal
      );
    },
    [activeId]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    // Mark any streaming messages as complete
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        ),
      }))
    );
  }, []);

  return {
    conversations,
    activeConversation,
    activeId,
    isStreaming,
    startNewChat,
    selectConversation,
    deleteConversation,
    sendMessage,
    cancelStream,
  };
}
