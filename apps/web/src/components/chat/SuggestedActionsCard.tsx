import React, { useState } from 'react';
import './SuggestedActionsCard.css';

export interface SuggestedActionsCardProps {
  title?: string;
  actions?: string[];
  questions?: string[];
  onSelectChoice?: (choice: string) => void;
}

export const SuggestedActionsCard: React.FC<SuggestedActionsCardProps> = ({
  title = 'Next Steps & Suggested Inquiries',
  actions = [],
  questions = [],
  onSelectChoice,
}) => {
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});
  const [copiedQuestionIdx, setCopiedQuestionIdx] = useState<number | null>(null);

  const toggleAction = (idx: number) => {
    setCompletedActions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleCopy = (text: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopiedQuestionIdx(idx);
    setTimeout(() => setCopiedQuestionIdx(null), 2000);
  };

  return (
    <div className="suggested-actions-card">
      {/* Top Header */}
      <div className="sac-header">
        <div className="sac-header-left">
          <div className="sac-icon-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <div>
            <h4 className="sac-title">{title}</h4>
            <span className="sac-subtitle">Recommended actions and high-leverage follow-up questions</span>
          </div>
        </div>
      </div>

      {/* Recommended Next Actions Checklist */}
      {actions.length > 0 && (
        <div className="sac-section">
          <span className="sac-section-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Recommended Next Actions:
          </span>
          <div className="sac-actions-list">
            {actions.map((act, idx) => {
              const isDone = !!completedActions[idx];
              return (
                <div
                  key={idx}
                  className={`sac-action-item ${isDone ? 'sac-action-item--done' : ''}`}
                  onClick={() => toggleAction(idx)}
                  role="checkbox"
                  aria-checked={isDone}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleAction(idx)}
                >
                  <div className={`sac-checkbox ${isDone ? 'sac-checkbox--checked' : ''}`}>
                    {isDone && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="sac-action-text">{act}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggested Inquiries / What to Ask Next */}
      {questions.length > 0 && (
        <div className="sac-section">
          <span className="sac-section-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            What to Ask Next:
          </span>
          <div className="sac-questions-list">
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="sac-question-card"
                onClick={() => onSelectChoice && onSelectChoice(q)}
                title="Click to ask this question"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onSelectChoice) {
                    onSelectChoice(q);
                  }
                }}
              >
                <div className="sac-question-content">
                  <span className="sac-question-bullet">💡</span>
                  <span className="sac-question-text">{q}</span>
                </div>
                <div className="sac-question-actions">
                  <button
                    type="button"
                    className="sac-copy-btn"
                    onClick={(e) => handleCopy(q, idx, e)}
                    title="Copy question text"
                  >
                    {copiedQuestionIdx === idx ? '✓ Copied' : 'Copy'}
                  </button>
                  {onSelectChoice && (
                    <span className="sac-ask-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
