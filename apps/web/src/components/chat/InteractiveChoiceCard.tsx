import React, { useState, useId } from 'react';
import { inferExplanationBranches, type ExplanationBranch } from './explanationBranches';
import './InteractiveChoiceCard.css';

export interface InteractiveChoiceCardProps {
  question: string;
  options?: string[];
  category?: string;
  typeBadge?: string;
  summary?: string;
  branches?: ExplanationBranch[];
  onSelectChoice?: (choice: string) => void;
}

export const InteractiveChoiceCard: React.FC<InteractiveChoiceCardProps> = ({
  question,
  options = [],
  category = 'Clarification & Choice',
  typeBadge = 'MCQ',
  summary,
  branches: customBranches,
  onSelectChoice,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const [copiedBranchId, setCopiedBranchId] = useState<string | null>(null);
  const svgId = useId();

  // Resolve 3 explanation branches (custom or intelligently inferred)
  const branches: ExplanationBranch[] = React.useMemo(() => {
    if (customBranches && customBranches.length > 0) {
      return customBranches.slice(0, 3);
    }
    return inferExplanationBranches(question, options, category);
  }, [customBranches, question, options, category]);

  const activeBranch = branches.find((b) => b.id === activeBranchId) || null;

  const handleSelectOption = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const handleBranchClick = (branch: ExplanationBranch) => {
    if (activeBranchId === branch.id) {
      setActiveBranchId(null);
    } else {
      setActiveBranchId(branch.id);
    }
  };

  const handleBranchAction = (promptText: string) => {
    if (onSelectChoice && promptText) {
      onSelectChoice(promptText);
    }
  };

  const handleCopyBranch = (branch: ExplanationBranch) => {
    const textToCopy = `${branch.title}\n${branch.summary}${branch.formula ? `\nFormula: ${branch.formula}` : ''}\n${branch.deepDive || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedBranchId(branch.id);
    setTimeout(() => setCopiedBranchId(null), 2000);
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="choice-card-container">
      {/* Top Outer Layout: Main Card + Right Branching Explanation Tree */}
      <div className="choice-card-layout">
        {/* Main Card with Cyan Boundary (#38bdf8) */}
        <div className="choice-card-main">
          <div className="choice-card__glow-line" />
          
          <div className="choice-card__header">
            <div className="choice-card__badge-row">
              <span className="choice-card__badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {typeBadge ? typeBadge.toUpperCase() : category.toUpperCase()}
              </span>
              <span className="choice-card__category-tag">{category}</span>
            </div>
            
            <h4 className="choice-card__question">{question}</h4>
            
            {summary && (
              <p className="choice-card__summary-text">{summary}</p>
            )}
          </div>

          {/* Options List (if provided) */}
          {options.length > 0 && (
            <div className="choice-card__options">
              {options.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                const letter = optionLetters[idx % optionLetters.length];

                return (
                  <button
                    key={idx}
                    type="button"
                    className={`choice-card__option-btn ${isSelected ? 'choice-card__option-btn--selected' : ''} ${
                      submitted && !isSelected ? 'choice-card__option-btn--dimmed' : ''
                    }`}
                    onClick={() => handleSelectOption(idx, opt)}
                    disabled={submitted}
                  >
                    <div className="choice-card__letter-badge">{letter}</div>
                    <span className="choice-card__option-text">{opt}</span>
                    <div className="choice-card__radio-indicator">
                      {isSelected ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="3">
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
          )}

          {submitted && selectedIndex !== null && (
            <div className="choice-card__submitted-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>
                Selected <strong>Option {optionLetters[selectedIndex]}:</strong> &ldquo;{options[selectedIndex]}&rdquo;
              </span>
            </div>
          )}
        </div>

        {/* Tree Branching Connector (SVG Curves) */}
        {branches.length > 0 && (
          <div className="choice-card-tree-connector" aria-hidden="true">
            <svg viewBox="0 0 46 130" className="choice-card-tree-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`${svgId}-cyan-grad`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.9" />
                </linearGradient>
                <filter id={`${svgId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Branch 0: Curves up */}
              <path
                d="M 2 65 C 20 65, 20 20, 44 20"
                fill="none"
                className={`choice-card-tree-path ${
                  activeBranchId === branches[0]?.id || hoveredBranchId === branches[0]?.id
                    ? 'choice-card-tree-path--active'
                    : ''
                }`}
              />
              {/* Branch 1: Straight middle */}
              <path
                d="M 2 65 L 44 65"
                fill="none"
                className={`choice-card-tree-path ${
                  activeBranchId === branches[1]?.id || hoveredBranchId === branches[1]?.id
                    ? 'choice-card-tree-path--active'
                    : ''
                }`}
              />
              {/* Branch 2: Curves down */}
              <path
                d="M 2 65 C 20 65, 20 110, 44 110"
                fill="none"
                className={`choice-card-tree-path ${
                  activeBranchId === branches[2]?.id || hoveredBranchId === branches[2]?.id
                    ? 'choice-card-tree-path--active'
                    : ''
                }`}
              />

              {/* Origin anchor dot */}
              <circle cx="2" cy="65" r="3.5" fill="#38bdf8" filter={`url(#${svgId}-glow)`} />
              {/* Branch destination dots */}
              <circle cx="43" cy="20" r="2.5" fill="#00d2ff" />
              <circle cx="43" cy="65" r="2.5" fill="#00d2ff" />
              <circle cx="43" cy="110" r="2.5" fill="#00d2ff" />
            </svg>
          </div>
        )}

        {/* Right-Side Interactive Explanation Branches Column ("Here we can use it For Explaniti.") */}
        {branches.length > 0 && (
          <div className="choice-card-branches">
            <div className="choice-card-branches__header">
              <span className="choice-card-branches__sparkle">✦</span>
              <span className="choice-card-branches__title">INTERACTIVE EXPLANATION</span>
            </div>

            <div className="choice-card-branches__list">
              {branches.map((branch) => {
                const isActive = activeBranchId === branch.id;
                return (
                  <button
                    key={branch.id}
                    type="button"
                    className={`choice-card-branch-pill ${isActive ? 'choice-card-branch-pill--active' : ''}`}
                    onClick={() => handleBranchClick(branch)}
                    onMouseEnter={() => setHoveredBranchId(branch.id)}
                    onMouseLeave={() => setHoveredBranchId(null)}
                    title={`Click to explore explanation: ${branch.title}`}
                  >
                    <div className="choice-card-branch-pill__icon">{branch.icon || '💡'}</div>
                    <div className="choice-card-branch-pill__body">
                      <span className="choice-card-branch-pill__title">{branch.title}</span>
                      {branch.badge && (
                        <span className="choice-card-branch-pill__badge">{branch.badge}</span>
                      )}
                    </div>
                    <div className="choice-card-branch-pill__chevron">
                      {isActive ? '▼' : '›'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Explanation Drawer / Drill-Down Panel (Revealed on Branch Click) */}
      {activeBranch && (
        <div className="choice-card-explanation-panel" role="region" aria-label="Interactive Explanation">
          <div className="choice-card-explanation-panel__top-accent" />
          
          <div className="choice-card-explanation-panel__header">
            <div className="choice-card-explanation-panel__title-group">
              <span className="choice-card-explanation-panel__icon">{activeBranch.icon || '💡'}</span>
              <div>
                <div className="choice-card-explanation-panel__tag-row">
                  <span className="choice-card-explanation-panel__badge">
                    {activeBranch.badge || 'DEEP DIVE EXPLANATION'}
                  </span>
                  <span className="choice-card-explanation-panel__hint">Interactive Concept Explorer</span>
                </div>
                <h5 className="choice-card-explanation-panel__title">{activeBranch.title}</h5>
              </div>
            </div>

            <button
              type="button"
              className="choice-card-explanation-panel__close-btn"
              onClick={() => setActiveBranchId(null)}
              title="Close explanation panel"
            >
              ✕
            </button>
          </div>

          <div className="choice-card-explanation-panel__body">
            <p className="choice-card-explanation-panel__summary">{activeBranch.summary}</p>

            {activeBranch.formula && (
              <div className="choice-card-explanation-panel__formula-box">
                <div className="choice-card-explanation-panel__formula-label">KEY EQUATION / MECHANISM:</div>
                <div className="choice-card-explanation-panel__formula-text">{activeBranch.formula}</div>
              </div>
            )}

            {activeBranch.deepDive && (
              <div className="choice-card-explanation-panel__deep-dive">
                <strong>Mechanism Note:</strong> {activeBranch.deepDive}
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="choice-card-explanation-panel__actions">
            {activeBranch.interactiveSimType && (
              <button
                type="button"
                className="choice-card-explanation-panel__action-btn choice-card-explanation-panel__action-btn--sim"
                onClick={() =>
                  handleBranchAction(
                    `Show interactive simulation for ${activeBranch.title} with live visuals and step-by-step breakdown.`
                  )
                }
              >
                <span>⚛️</span>
                <span>Launch Live Visual</span>
              </button>
            )}

            <button
              type="button"
              className="choice-card-explanation-panel__action-btn"
              onClick={() =>
                handleBranchAction(
                  activeBranch.actionPrompt || `Explain the detailed mechanism of ${activeBranch.title} in depth.`
                )
              }
            >
              <span>💬</span>
              <span>Ask AI Deeper</span>
            </button>

            <button
              type="button"
              className="choice-card-explanation-panel__action-btn"
              onClick={() => handleCopyBranch(activeBranch)}
            >
              <span>{copiedBranchId === activeBranch.id ? '✓' : '📋'}</span>
              <span>{copiedBranchId === activeBranch.id ? 'Copied!' : 'Copy Note'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
