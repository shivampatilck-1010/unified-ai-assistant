import React, { useState } from 'react';
import './InteractiveChoiceCard.css';

export interface InteractiveChoiceCardProps {
  question: string;
  options?: string[];
  category?: string;
  typeBadge?: string;
  summary?: string;
  onSelectChoice?: (choice: string) => void;
}

export const InteractiveChoiceCard: React.FC<InteractiveChoiceCardProps> = ({
  question,
  options = [],
  category = 'Clarification & Choice',
  typeBadge = 'MCQ',
  summary,
  onSelectChoice,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSelectOption = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="cortex-card-wrapper">
      {/* Centered Card with Colored Boundary (No color until hovered) */}
      <div className="cortex-card-main">
        <div className="cortex-card-header">
          <span className="cortex-badge">{typeBadge.toUpperCase()}</span>
          <span className="cortex-category">{category}</span>
        </div>

        <h4 className="cortex-card-title">{question}</h4>

        {summary && <p className="cortex-card-summary">{summary}</p>}

        {/* Options List */}
        {options.length > 0 && (
          <div className="cortex-options-list">
            {options.map((opt, idx) => {
              const isSelected = selectedIndex === idx;
              const letter = optionLetters[idx % optionLetters.length];

              return (
                <button
                  key={idx}
                  type="button"
                  className={`cortex-option-btn ${isSelected ? 'cortex-option-btn--selected' : ''} ${
                    submitted && !isSelected ? 'cortex-option-btn--dimmed' : ''
                  }`}
                  onClick={() => handleSelectOption(idx, opt)}
                  disabled={submitted}
                >
                  <div className="cortex-option-letter">{letter}</div>
                  <span className="cortex-option-text">{opt}</span>
                  <div className="cortex-option-radio">
                    {isSelected ? (
                      <div className="cortex-radio-checked" />
                    ) : (
                      <div className="cortex-radio-empty" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selection Feedback Banner */}
        {submitted && selectedIndex !== null && (
          <div className="cortex-submitted-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>
              Selected <strong>Option {optionLetters[selectedIndex]}:</strong> &ldquo;{options[selectedIndex]}&rdquo;
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
