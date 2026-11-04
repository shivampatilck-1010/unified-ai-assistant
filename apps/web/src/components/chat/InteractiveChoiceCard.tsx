import React, { useState } from 'react';
import './InteractiveChoiceCard.css';

export interface InteractiveChoiceCardProps {
  question: string;
  options: string[];
  category?: string;
  onSelectChoice?: (choice: string) => void;
}

export const InteractiveChoiceCard: React.FC<InteractiveChoiceCardProps> = ({
  question,
  options,
  category = 'Clarification & Choice',
  onSelectChoice,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSelect = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="choice-card">
      <div className="choice-card__glow-line" />
      <div className="choice-card__header">
        <div className="choice-card__badge-row">
          <span className="choice-card__badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {category.toUpperCase()}
          </span>
          <span className="choice-card__meta-hint">Click an option to respond</span>
        </div>
        <h4 className="choice-card__question">{question}</h4>
      </div>

      <div className="choice-card__options">
        {options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          const letter = optionLetters[idx % optionLetters.length];

          return (
            <button
              key={idx}
              type="button"
              className={`choice-card__option-btn ${isSelected ? 'choice-card__option-btn--selected' : ''} ${submitted && !isSelected ? 'choice-card__option-btn--dimmed' : ''}`}
              onClick={() => handleSelect(idx, opt)}
              disabled={submitted}
            >
              <div className="choice-card__letter-badge">{letter}</div>
              <span className="choice-card__option-text">{opt}</span>
              <div className="choice-card__radio-indicator">
                {isSelected ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <div className="choice-card__radio-empty" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {submitted && (
        <div className="choice-card__submitted-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Selected <strong>Option {selectedIndex !== null ? optionLetters[selectedIndex] : ''}:</strong> &ldquo;{selectedIndex !== null ? options[selectedIndex] : ''}&rdquo;</span>
        </div>
      )}
    </div>
  );
};
