import React, { useState } from 'react';
import type { ConversationSummary } from '../../types';
import './SearchView.css';

interface SearchViewProps {
  conversations: ConversationSummary[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  conversations,
  onSelectConversation,
  onNewChat,
}) => {
  const [query, setQuery] = useState('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <div className="search-view">
      <div className="search-view__container">
        <div className="search-view__header">
          <h2>Search Conversations</h2>
          <p>Instantly find past chats, research findings, and task histories.</p>
        </div>

        <div className="search-input-wrapper">
          <svg className="search-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5" stroke="#94a3b8" strokeWidth="1.6" />
            <path d="M11.5 11.5l4 4" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Type keywords to filter conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="search-clear-btn" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="search-results-list">
          {filtered.length > 0 ? (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className="search-result-item"
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="search-result-title">{conv.title || 'Untitled Conversation'}</div>
                <div className="search-result-meta">
                  <span>Updated {new Date(conv.updated_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{new Date(conv.updated_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="search-empty-state">
              <p>No conversations matched &quot;{query}&quot;</p>
              <button type="button" className="btn-search-new" onClick={onNewChat}>
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
