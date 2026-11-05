import React, { useState } from 'react';
import { inferExplanationBranches, type ExplanationBranch } from './explanationBranches';
import './InteractiveChoiceCard.css';

export interface InteractiveChoiceCardProps {
  question: string;
  options?: string[];
  category?: string;
  typeBadge?: string;
  summary?: string;
  onSelectChoice?: (choice: string) => void;
}

function renderBranchIcon(iconType?: string) {
  switch (iconType) {
    case 'compass':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case 'formula':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 19h16M4 5h16M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case 'atom':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="2" />
          <path d="M12 2a10 5 0 0 1 0 20 10 5 0 0 1 0-20z" transform="rotate(30 12 12)" />
          <path d="M12 2a10 5 0 0 1 0 20 10 5 0 0 1 0-20z" transform="rotate(-30 12 12)" />
        </svg>
      );
    case 'database':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case 'code':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case 'layers':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case 'tree':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="5" r="3" />
          <circle cx="6" cy="17" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M12 8v4M12 12l-4 3M12 12l4 3" />
        </svg>
      );
    case 'cpu':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

export const InteractiveChoiceCard: React.FC<InteractiveChoiceCardProps> = ({
  question,
  options = [],
  category = 'Inquiry & Reasoning',
  typeBadge = 'Inquiry',
  summary,
  onSelectChoice,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [isCardCollapsed, setIsCardCollapsed] = useState<boolean>(false);

  // Conceptual reference branches (default to COLLAPSED to prevent screen clutter)
  const [branches] = useState<ExplanationBranch[]>(() =>
    inferExplanationBranches(question, options, category)
  );
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [showBranches, setShowBranches] = useState<boolean>(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  const handleSelectOption = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const handleToggleDeepDive = (branchId: string) => {
    setExpandedBranchId((prev) => (prev === branchId ? null : branchId));
  };

  const handleDownloadBranch = (branch: ExplanationBranch) => {
    try {
      const content =
        `# Conceptual Study Reference: ${branch.title}\n\n` +
        `**Domain Area**: ${branch.badge || 'Cognitive Sciences'}\n\n` +
        `## Overview & Summary\n${branch.summary}\n\n` +
        (branch.formula ? `## Mathematical / Formal Relation\n\`\`\`\n${branch.formula}\n\`\`\`\n\n` : '') +
        (branch.deepDive ? `## Analytical Deep-Dive\n${branch.deepDive}\n\n` : '') +
        `---\n*Exported from Unified AI Cognitive Workspace on ${new Date().toLocaleString()}*`;

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${branch.id}_study_reference.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setDownloadFeedback(branch.id);
      setTimeout(() => setDownloadFeedback(null), 2000);
    } catch (e) {
      console.error('Download error:', e);
    }
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="cortex-card-wrapper">
      {/* Claude Editorial Styled Container */}
      <div className={`cortex-card-main ${isCardCollapsed ? 'cortex-card-main--collapsed' : ''}`}>
        <div className="cortex-card-header">
          <div className="cortex-header-meta">
            <span className="cortex-badge">{typeBadge.toUpperCase()}</span>
            <span className="cortex-category">{category}</span>
          </div>
          <div className="cortex-header-actions">
            <span className="cortex-brand-hint">Claude Editorial Model</span>
            <button
              type="button"
              className="cortex-card-collapse-toggle-btn"
              onClick={() => setIsCardCollapsed((prev) => !prev)}
              aria-label={isCardCollapsed ? 'Expand Question Card' : 'Collapse Question Card'}
              title={isCardCollapsed ? 'Expand Question Card' : 'Collapse Question Card'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                {isCardCollapsed ? (
                  <path d="M6 9l6 6 6-6" />
                ) : (
                  <path d="M18 15l-6-6-6 6" />
                )}
              </svg>
              <span>{isCardCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </div>
        </div>

        {isCardCollapsed ? (
          <div
            className="cortex-collapsed-preview"
            onClick={() => setIsCardCollapsed(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setIsCardCollapsed(false)}
          >
            <div className="cortex-collapsed-text-group">
              <span className="cortex-collapsed-title">{question}</span>
              {submitted && selectedIndex !== null ? (
                <span className="cortex-collapsed-badge cortex-collapsed-badge--answered">
                  ✓ Recorded: Option {optionLetters[selectedIndex]}: &ldquo;{options[selectedIndex]}&rdquo;
                </span>
              ) : (
                <span className="cortex-collapsed-badge cortex-collapsed-badge--count">
                  {options.length} Options Ready
                </span>
              )}
            </div>
            <button
              type="button"
              className="cortex-expand-pill"
              onClick={(e) => {
                e.stopPropagation();
                setIsCardCollapsed(false);
              }}
            >
              <span>Expand ▾</span>
            </button>
          </div>
        ) : (
          <>
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>
                  Recorded response: <strong>Option {optionLetters[selectedIndex]}:</strong> &ldquo;{options[selectedIndex]}&rdquo;
                </span>
              </div>
            )}

            {/* Conceptual Foundations & Reference Branches */}
            {branches.length > 0 && (
              <div className="cortex-branches-section">
                <div
                  className="cortex-branches-header-row"
                  onClick={() => setShowBranches((s) => !s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setShowBranches((s) => !s)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cortex-branches-title-group">
                    <span className="cortex-branches-title">Key Principles & Deeper Exploration</span>
                    <span className="cortex-branches-count">({branches.length})</span>
                  </div>
                  <button
                    type="button"
                    className="cortex-branch-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBranches((s) => !s);
                    }}
                    aria-label={showBranches ? 'Collapse exploration paths' : 'Expand exploration paths'}
                  >
                    {showBranches ? 'Collapse Branches ▴' : 'Explore Principles (3) ▾'}
                  </button>
                </div>

                <div className={`cortex-branches-accordion ${showBranches ? 'cortex-branches-accordion--open' : ''}`}>
                  {showBranches && (
                    <div className="cortex-branches-list">
                      {branches.map((b) => {
                        const isExpanded = expandedBranchId === b.id;
                        const isDownloaded = downloadFeedback === b.id;

                        return (
                          <div key={b.id} className="cortex-branch-card">
                            <div className="cortex-branch-header">
                              <div className="cortex-branch-title-wrap">
                                <span className="cortex-branch-icon" aria-hidden="true">
                                  {renderBranchIcon(b.iconType)}
                                </span>
                                <span className="cortex-branch-title">{b.title}</span>
                                {b.badge && <span className="cortex-branch-badge">{b.badge}</span>}
                              </div>

                              {/* Action Nodes: Inspect, Export */}
                              <div className="cortex-branch-actions">
                                <button
                                  type="button"
                                  className={`cortex-branch-action-btn ${isExpanded ? 'cortex-branch-action-btn--active' : ''}`}
                                  onClick={() => handleToggleDeepDive(b.id)}
                                  title={isExpanded ? 'Hide deep dive' : 'Inspect deep dive'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    {isExpanded ? (
                                      <path d="M18 15l-6-6-6 6" />
                                    ) : (
                                      <path d="M6 9l6 6 6-6" />
                                    )}
                                  </svg>
                                  <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                                </button>

                                <button
                                  type="button"
                                  className="cortex-branch-action-btn"
                                  onClick={() => handleDownloadBranch(b)}
                                  title="Export study reference note"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>{isDownloaded ? 'Exported!' : 'Export'}</span>
                                </button>
                              </div>
                            </div>

                            <p className="cortex-branch-summary">{b.summary}</p>

                            {b.formula && (
                              <div className="cortex-branch-formula">
                                <code>{b.formula}</code>
                              </div>
                            )}

                            {/* Deep Dive Panel */}
                            {isExpanded && b.deepDive && (
                              <div className="cortex-branch-deepdive">
                                <div className="cortex-deepdive-label">
                                  Analytical Mechanics & Invariant:
                                </div>
                                <div className="cortex-deepdive-text">
                                  {b.deepDive}
                                </div>
                                {b.actionPrompt && onSelectChoice && (
                                  <button
                                    type="button"
                                    className="cortex-explore-btn"
                                    onClick={() => onSelectChoice(b.actionPrompt!)}
                                  >
                                    <span>Explore Further in Chat</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                      <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
