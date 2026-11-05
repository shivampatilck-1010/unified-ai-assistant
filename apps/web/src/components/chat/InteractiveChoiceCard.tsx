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

  // Cybernetic Branching Reference Modules
  const [branches, setBranches] = useState<ExplanationBranch[]>(() =>
    inferExplanationBranches(question, options, category)
  );
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [showBranches, setShowBranches] = useState<boolean>(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  const handleSelectOption = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);
    setShowBranches(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const handleToggleDeepDive = (branchId: string) => {
    setExpandedBranchId((prev) => (prev === branchId ? null : branchId));
  };

  const handleDownloadBranch = (branch: ExplanationBranch) => {
    try {
      const content = `# Study Sheet: ${branch.title}\n\n` +
        `**Domain**: ${branch.badge || 'STEM'}\n\n` +
        `## Concept Summary\n${branch.summary}\n\n` +
        (branch.formula ? `## Mathematical / Chemical Formula\n\`\`\`\n${branch.formula}\n\`\`\`\n\n` : '') +
        (branch.deepDive ? `## In-Depth Analysis\n${branch.deepDive}\n\n` : '') +
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

  const handleDeleteBranch = (branchId: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="cortex-card-wrapper">
      {/* Centered Card with Colored Boundary */}
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

        {/* Branching Reference Modules Section */}
        {branches.length > 0 && (
          <div className="cortex-branches-section" style={{ marginTop: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#00e5ff' }}>
                  CYBERNETIC PEDAGOGICAL MODULES
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>({branches.length})</span>
              </div>
              <button
                type="button"
                className="cortex-branch-action-btn"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => setShowBranches((s) => !s)}
              >
                {showBranches ? '▲ Collapse Paths' : '▼ Expand Paths'}
              </button>
            </div>

            {showBranches && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {branches.map((b) => {
                  const isExpanded = expandedBranchId === b.id;
                  const isDownloaded = downloadFeedback === b.id;

                  return (
                    <div key={b.id} className="cortex-branch-card">
                      <div className="cortex-branch-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="cortex-branch-icon">{b.icon || '🧬'}</span>
                          <span className="cortex-branch-title">{b.title}</span>
                          {b.badge && <span className="cortex-branch-badge">{b.badge}</span>}
                        </div>

                        {/* Action Nodes: View, Download, Delete */}
                        <div className="cortex-branch-actions">
                          <button
                            type="button"
                            className="cortex-branch-action-btn"
                            onClick={() => handleToggleDeepDive(b.id)}
                            title={isExpanded ? 'Hide Deep Dive' : 'View Deep Dive'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>{isExpanded ? 'Hide' : 'View'}</span>
                          </button>

                          <button
                            type="button"
                            className="cortex-branch-action-btn"
                            onClick={() => handleDownloadBranch(b)}
                            title="Download study reference note"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>{isDownloaded ? 'Saved!' : 'Download'}</span>
                          </button>

                          <button
                            type="button"
                            className="cortex-branch-action-btn cortex-branch-action-btn--delete"
                            onClick={() => handleDeleteBranch(b.id)}
                            title="Dismiss / Delete reference module"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            <span>Delete</span>
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
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
                            MECHANISM DEEP-DIVE:
                          </div>
                          <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}>
                            {b.deepDive}
                          </div>
                          {b.actionPrompt && onSelectChoice && (
                            <button
                              type="button"
                              className="sim-btn sim-btn--primary"
                              style={{ marginTop: '8px', fontSize: '11px', padding: '4px 10px' }}
                              onClick={() => onSelectChoice(b.actionPrompt!)}
                            >
                              Explore Further in Chat ➔
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
        )}
      </div>
    </div>
  );
};
