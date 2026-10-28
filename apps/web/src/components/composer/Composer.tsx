import { useState, useRef, useEffect } from 'react';
import './Composer.css';

interface ComposerProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  onCancel?: () => void;
  disabled?: boolean;
}

export function Composer({ onSend, isStreaming, onCancel, disabled }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [value]);

  return (
    <div className="composer">
      <div className="composer__inner">
        <button
          className="composer__attach-btn"
          aria-label="Attach file (not yet available)"
          title="File attachments are not yet implemented"
          disabled
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M14.5 9.5l-5.6 5.6a3.5 3.5 0 01-5-5l6.3-6.3a2.25 2.25 0 013.2 3.2L7 13.3a1 1 0 01-1.4-1.4L11.3 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          className="composer__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          rows={1}
          disabled={disabled}
          aria-label="Message input"
        />

        {isStreaming ? (
          <button
            className="composer__stop-btn"
            onClick={onCancel}
            type="button"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            className="composer__send-btn"
            onClick={handleSubmit}
            disabled={!canSend}
            type="button"
            aria-label="Send message"
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="composer__hint">
        <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline
      </div>
    </div>
  );
}
