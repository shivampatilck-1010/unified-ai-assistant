import React, { useState } from 'react';
import './PromptFlashcard.css';

interface PromptFlashcardProps {
  promptText: string;
  title?: string;
  category?: string;
}

export const PromptFlashcard: React.FC<PromptFlashcardProps> = ({
  promptText,
  title = 'AI Prompt Flashcard',
  category = 'Direct Copy',
}) => {
  const [copied, setCopied] = useState(false);

  const cleanPrompt = promptText.trim().replace(/^["“]|["”]$/g, '').trim();

  const handleCopy = () => {
    void navigator.clipboard.writeText(cleanPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleInsertIntoComposer = () => {
    window.dispatchEvent(new CustomEvent('insert-into-composer', { detail: cleanPrompt }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="prompt-flashcard">
      <div className="prompt-flashcard__header">
        <div className="prompt-flashcard__title-group">
          <span className="prompt-flashcard__icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z" />
            </svg>
          </span>
          <div>
            <span className="prompt-flashcard__title">{title}</span>
            <span className="prompt-flashcard__badge">{category}</span>
          </div>
        </div>

        <div className="prompt-flashcard__actions">
          <button
            type="button"
            className="prompt-flashcard__btn prompt-flashcard__btn--use"
            onClick={handleInsertIntoComposer}
            title="Place this prompt directly into chat input"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Use in Chat</span>
          </button>

          <button
            type="button"
            className={`prompt-flashcard__btn prompt-flashcard__btn--copy ${copied ? 'prompt-flashcard__btn--copied' : ''}`}
            onClick={handleCopy}
            title="Copy prompt text to clipboard"
          >
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy Prompt</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="prompt-flashcard__body">
        <div className="prompt-flashcard__quote-mark">“</div>
        <p className="prompt-flashcard__text">{cleanPrompt}</p>
      </div>

      <div className="prompt-flashcard__footer">
        <span>Click <strong>Copy Prompt</strong> or <strong>Use in Chat</strong> to test your AI with this prompt instantly.</span>
      </div>
    </div>
  );
};
