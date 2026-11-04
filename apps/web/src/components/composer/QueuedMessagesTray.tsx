import React, { useState } from 'react';
import type { ChatAttachment } from '../../types';
import './QueuedMessagesTray.css';

export interface QueuedMessage {
  id: string;
  content: string;
  attachments?: ChatAttachment[];
  timestamp: number;
}

interface QueuedMessagesTrayProps {
  messages: QueuedMessage[];
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
  onEdit: (id: string) => void;
}

export const QueuedMessagesTray: React.FC<QueuedMessagesTrayProps> = ({
  messages,
  onRemove,
  onSendNow,
  onEdit,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!messages || messages.length === 0) return null;

  return (
    <div className="queued-messages-tray" role="region" aria-label="Queued messages">
      {/* Header Bar */}
      <div
        className="queued-messages-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expand queued messages' : 'Collapse queued messages'}
      >
        <div className="queued-messages-header__left">
          <span className="queued-messages-header__title">Queued Messages</span>
          <span className="queued-messages-header__badge">{messages.length}</span>
          <span className="queued-messages-header__subtext">Sends after agent finishes working</span>
        </div>

        <button
          type="button"
          className={`queued-messages-header__toggle-btn ${isCollapsed ? 'queued-messages-header__toggle-btn--collapsed' : ''}`}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(!isCollapsed);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Messages List */}
      {!isCollapsed && (
        <div className="queued-messages-list">
          {messages.map((item) => {
            const firstImg = item.attachments?.find((a) => a.mimeType?.startsWith('image/'));
            const firstNonImg = item.attachments?.find((a) => !a.mimeType?.startsWith('image/'));

            return (
              <div key={item.id} className="queued-message-item">
                {/* Optional Media Thumbnail */}
                {firstImg ? (
                  <img
                    src={firstImg.previewUrl || firstImg.data}
                    alt={firstImg.name || 'Attachment'}
                    className="queued-message-thumb"
                  />
                ) : firstNonImg ? (
                  <div className="queued-message-file-icon" title={firstNonImg.name}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                ) : null}

                {/* Message Content */}
                <div className="queued-message-text" title={item.content}>
                  {item.content || (item.attachments && item.attachments.length > 0 ? `${item.attachments.length} attachment(s)` : 'Empty message')}
                </div>

                {/* Actions */}
                <div className="queued-message-actions">
                  <button
                    type="button"
                    className="queued-action-btn queued-action-btn--send"
                    onClick={() => onSendNow(item.id)}
                    title="Send now (interrupts current answer)"
                    aria-label="Send now"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="queued-action-btn queued-action-btn--edit"
                    onClick={() => onEdit(item.id)}
                    title="Edit message in composer"
                    aria-label="Edit message"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="queued-action-btn queued-action-btn--delete"
                    onClick={() => onRemove(item.id)}
                    title="Delete queued message"
                    aria-label="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
