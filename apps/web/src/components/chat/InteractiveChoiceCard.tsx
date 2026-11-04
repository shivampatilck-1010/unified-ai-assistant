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
  category = 'General',
  typeBadge = 'LINK',
  summary,
  branches: customBranches,
  onSelectChoice,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [isViewOpen, setIsViewOpen] = useState<boolean>(false);
  const [activeBranchIdx, setActiveBranchIdx] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [isDeleted, setIsDeleted] = useState<boolean>(false);
  const svgId = useId();

  // Resolve 3 explanation branches (custom or intelligently inferred)
  const branches: ExplanationBranch[] = React.useMemo(() => {
    if (customBranches && customBranches.length > 0) {
      return customBranches.slice(0, 3);
    }
    return inferExplanationBranches(question, options, category);
  }, [customBranches, question, options, category]);

  const activeBranch = branches[activeBranchIdx] || branches[0];

  const handleSelectOption = (idx: number, opt: string) => {
    if (submitted) return;
    setSelectedIndex(idx);
    setSubmitted(true);

    if (onSelectChoice) {
      onSelectChoice(opt);
    }
  };

  const handleViewToggle = () => {
    setIsViewOpen((prev) => !prev);
  };

  const handleDownload = () => {
    const content = `=== ${question} ===\n${summary ? summary + '\n\n' : ''}${
      options.length > 0 ? 'OPTIONS:\n' + options.map((o, i) => `[${String.fromCharCode(65 + i)}] ${o}`).join('\n') + '\n\n' : ''
    }EXPLANATION BRANCHES:\n` +
      branches
        .map(
          (b, i) =>
            `${i + 1}. ${b.title} [${b.badge || 'CORE'}]\nSummary: ${b.summary}\n${b.formula ? `Formula: ${b.formula}\n` : ''}${
              b.deepDive ? `Notes: ${b.deepDive}\n` : ''
            }`
        )
        .join('\n\n');

    navigator.clipboard.writeText(content);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);

    if (onSelectChoice) {
      onSelectChoice(`Download resource for: ${question.slice(0, 60)}`);
    }
  };

  const handleDelete = () => {
    setSelectedIndex(null);
    setSubmitted(false);
    setIsViewOpen(false);
    setIsDeleted(true);
    setTimeout(() => setIsDeleted(false), 2000);
  };

  const handleAddResource = () => {
    if (onSelectChoice) {
      onSelectChoice(`Add resource and reference materials for: ${question.slice(0, 60)}`);
    }
  };

  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="cortex-canvas-container">
      {/* Top Header Row with "+ Add Resource" button matching reference */}
      <div className="cortex-top-action-row">
        <div className="cortex-top-section-title">
          <span className="cortex-top-title-icon">✦</span>
          <span>Interactive Resource & Knowledge Module</span>
        </div>
        <button
          type="button"
          className="cortex-add-resource-btn"
          onClick={handleAddResource}
          title="Add related resource to classroom"
        >
          <span className="cortex-add-plus">+</span>
          <span>Add Resource</span>
        </button>
      </div>

      {/* Main Layout: Main Cyan Card + SVG Circuit Tree + Chamfered Action Nodes */}
      <div className="cortex-card-layout">
        {/* Main Card with Neon Cyan Border (#00e5ff) */}
        <div className="cortex-card-main">
          <div className="cortex-card-header">
            <span className="cortex-badge">{typeBadge.toUpperCase()}</span>
            <span className="cortex-category">{category}</span>
          </div>

          <h4 className="cortex-card-title">{question}</h4>

          {summary && <p className="cortex-card-summary">{summary}</p>}

          {/* Options List (if provided) */}
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

          {submitted && selectedIndex !== null && (
            <div className="cortex-submitted-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>
                Selected <strong>Option {optionLetters[selectedIndex]}:</strong> &ldquo;{options[selectedIndex]}&rdquo;
              </span>
            </div>
          )}

          {downloadSuccess && (
            <div className="cortex-submitted-banner cortex-submitted-banner--download">
              <span>✓ Resource & Study Notes downloaded to clipboard!</span>
            </div>
          )}

          {isDeleted && (
            <div className="cortex-submitted-banner cortex-submitted-banner--delete">
              <span>✓ Selection cleared and reset.</span>
            </div>
          )}
        </div>

        {/* SVG Circuit Connector Tree (Matching Reference Exact Geometry) */}
        <div className="cortex-tree-connector" aria-hidden="true">
          <svg
            width="60"
            height="132"
            viewBox="0 0 60 132"
            className="cortex-tree-svg"
          >
            <defs>
              <filter id={`${svgId}-cyanGlow`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`${svgId}-roseGlow`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Trunk */}
            <line x1="0" y1="66" x2="16" y2="66" stroke="#00e5ff" strokeWidth="1.8" filter={`url(#${svgId}-cyanGlow)`} />

            {/* Branch 1: Curves UP to VIEW button */}
            <path
              d="M 16,66 C 36,66 36,18 60,18"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="1.8"
              filter={`url(#${svgId}-cyanGlow)`}
              className={isViewOpen ? 'cortex-path--active' : ''}
            />

            {/* Branch 2: Straight horizontal to DOWNLOAD button */}
            <path
              d="M 16,66 L 60,66"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="1.8"
              filter={`url(#${svgId}-cyanGlow)`}
            />

            {/* Branch 3: Curves DOWN to DELETE button */}
            <path
              d="M 16,66 C 36,66 36,114 60,114"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="1.8"
              filter={`url(#${svgId}-roseGlow)`}
            />

            {/* Origin Junction Dot */}
            <circle cx="2" cy="66" r="2.5" fill="#00e5ff" />

            {/* End Dots attaching to node edges */}
            <circle cx="58" cy="18" r="2" fill="#00e5ff" />
            <circle cx="58" cy="66" r="2" fill="#00e5ff" />
            <circle cx="58" cy="114" r="2" fill="#f43f5e" />
          </svg>
        </div>

        {/* 3 Chamfered Tech Action Nodes (VIEW, DOWNLOAD, DELETE) */}
        <div className="cortex-nodes-column">
          {/* Node 1: VIEW */}
          <button
            type="button"
            className={`cortex-action-node cortex-action-node--view ${isViewOpen ? 'cortex-action-node--active' : ''}`}
            onClick={handleViewToggle}
            title="Click to view full interactive explanation"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{isViewOpen ? 'CLOSE' : 'VIEW'}</span>
          </button>

          {/* Node 2: DOWNLOAD */}
          <button
            type="button"
            className="cortex-action-node cortex-action-node--download"
            onClick={handleDownload}
            title="Download / Copy reference notes"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>DOWNLOAD</span>
          </button>

          {/* Node 3: DELETE */}
          <button
            type="button"
            className="cortex-action-node cortex-action-node--delete"
            onClick={handleDelete}
            title="Reset or clear selection"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>DELETE</span>
          </button>
        </div>
      </div>

      {/* Interactive Explanation View (Revealed when VIEW is clicked) */}
      {isViewOpen && (
        <div className="cortex-view-drawer">
          <div className="cortex-drawer-header">
            <div className="cortex-drawer-title-group">
              <span className="cortex-drawer-icon">👁</span>
              <div>
                <span className="cortex-drawer-sub">INTERACTIVE EXPLANATION VIEWER</span>
                <h5 className="cortex-drawer-title">{activeBranch.title}</h5>
              </div>
            </div>
            <button
              type="button"
              className="cortex-drawer-close"
              onClick={() => setIsViewOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Branch Sub-concept Tabs */}
          <div className="cortex-branch-tabs">
            {branches.map((b, idx) => (
              <button
                key={b.id || idx}
                type="button"
                className={`cortex-branch-tab ${activeBranchIdx === idx ? 'cortex-branch-tab--active' : ''}`}
                onClick={() => setActiveBranchIdx(idx)}
              >
                <span>{b.icon || '✦'}</span>
                <span>{b.title}</span>
                {b.badge && <span className="cortex-tab-badge">{b.badge}</span>}
              </button>
            ))}
          </div>

          <div className="cortex-drawer-body">
            <p className="cortex-drawer-summary">{activeBranch.summary}</p>

            {activeBranch.formula && (
              <div className="cortex-formula-box">
                <div className="cortex-formula-label">GOVERNING EQUATION / MECHANISM:</div>
                <div className="cortex-formula-code">{activeBranch.formula}</div>
              </div>
            )}

            {activeBranch.deepDive && (
              <div className="cortex-deep-dive">
                <strong>Mechanism Insight:</strong> {activeBranch.deepDive}
              </div>
            )}
          </div>

          <div className="cortex-drawer-actions">
            {activeBranch.interactiveSimType && (
              <button
                type="button"
                className="cortex-btn-action cortex-btn-action--sim"
                onClick={() =>
                  onSelectChoice &&
                  onSelectChoice(`Show interactive simulation for ${activeBranch.title} with live controls`)
                }
              >
                <span>⚛️</span>
                <span>Launch Live Visual</span>
              </button>
            )}

            <button
              type="button"
              className="cortex-btn-action"
              onClick={() =>
                onSelectChoice &&
                onSelectChoice(activeBranch.actionPrompt || `Explain the mechanism of ${activeBranch.title} in detail.`)
              }
            >
              <span>💬</span>
              <span>Ask AI Deeper</span>
            </button>

            <button type="button" className="cortex-btn-action" onClick={handleDownload}>
              <span>📋</span>
              <span>Copy Notes</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
