import React, { useState, useId, useRef, useEffect, useCallback } from 'react';
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
  const [hoveredNode, setHoveredNode] = useState<'view' | 'download' | 'delete' | null>(null);
  // Support both Image 6 (Interactive Explanation Branches) and Image 7/8 (Chamfered Cyber Actions)
  const [rightPanelView, setRightPanelView] = useState<'branches' | 'actions'>(
    options.length > 0 ? 'branches' : 'actions'
  );
  const svgId = useId();

  // Resolve 3 explanation branches (custom or intelligently inferred)
  const branches: ExplanationBranch[] = React.useMemo(() => {
    if (customBranches && customBranches.length > 0) {
      return customBranches.slice(0, 3);
    }
    return inferExplanationBranches(question, options, category);
  }, [customBranches, question, options, category]);

  const activeBranch = branches[activeBranchIdx] || branches[0];

  // Dynamic S-curve coordinates
  const layoutRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const connectorRef = useRef<HTMLDivElement>(null);
  const viewNodeRef = useRef<HTMLButtonElement>(null);
  const downloadNodeRef = useRef<HTMLButtonElement>(null);
  const deleteNodeRef = useRef<HTMLButtonElement>(null);

  const [coords, setCoords] = useState<{
    rootY: number;
    yView: number;
    yDownload: number;
    yDelete: number;
    w: number;
    h: number;
  }>({
    rootY: 66,
    yView: 18,
    yDownload: 66,
    yDelete: 114,
    w: 64,
    h: 132,
  });

  const updateCoordinates = useCallback(() => {
    if (!connectorRef.current || !cardRef.current) return;
    const connRect = connectorRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();

    if (connRect.width === 0 || connRect.height === 0) return;

    // Center of main card's right border
    const rootY = cardRect.top + cardRect.height / 2 - connRect.top;

    let yView = 18;
    let yDownload = 66;
    let yDelete = 114;

    if (viewNodeRef.current) {
      const r0 = viewNodeRef.current.getBoundingClientRect();
      yView = r0.top + r0.height / 2 - connRect.top;
    }
    if (downloadNodeRef.current) {
      const r1 = downloadNodeRef.current.getBoundingClientRect();
      yDownload = r1.top + r1.height / 2 - connRect.top;
    }
    if (deleteNodeRef.current) {
      const r2 = deleteNodeRef.current.getBoundingClientRect();
      yDelete = r2.top + r2.height / 2 - connRect.top;
    }

    const w = connRect.width || 64;
    const h = connRect.height || Math.max(cardRect.height, 132);

    setCoords({ rootY, yView, yDownload, yDelete, w, h });
  }, []);

  useEffect(() => {
    updateCoordinates();
    const timer = setTimeout(updateCoordinates, 50);

    window.addEventListener('resize', updateCoordinates);
    const observer = new ResizeObserver(() => updateCoordinates());
    if (layoutRef.current) observer.observe(layoutRef.current);
    if (cardRef.current) observer.observe(cardRef.current);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoordinates);
      observer.disconnect();
    };
  }, [updateCoordinates, question, options]);

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
      options.length > 0
        ? 'OPTIONS:\n' + options.map((o, i) => `[${String.fromCharCode(65 + i)}] ${o}`).join('\n') + '\n\n'
        : ''
    }EXPLANATION BRANCHES:\n` +
      branches
        .map(
          (b, i) =>
            `${i + 1}. ${b.title} [${b.badge || 'CORE'}]\nSummary: ${b.summary}\n${
              b.formula ? `Formula: ${b.formula}\n` : ''
            }${b.deepDive ? `Notes: ${b.deepDive}\n` : ''}`
        )
        .join('\n\n');

    navigator.clipboard.writeText(content);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);

    if (onSelectChoice) {
      onSelectChoice(`Download resource notes for: ${question.slice(0, 60)}`);
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

  // Smooth S-curve control points (Fluid Fiber)
  const c1x = coords.w * 0.45;
  const c2x = coords.w * 0.55;

  const topCurveD = `M 0,${coords.rootY} C ${c1x},${coords.rootY} ${c2x},${coords.yView} ${coords.w},${coords.yView}`;
  const midCurveD = `M 0,${coords.rootY} C ${c1x},${coords.rootY} ${c2x},${coords.yDownload} ${coords.w},${coords.yDownload}`;
  const botCurveD = `M 0,${coords.rootY} C ${c1x},${coords.rootY} ${c2x},${coords.yDelete} ${coords.w},${coords.yDelete}`;

  return (
    <div className="cortex-canvas-container">
      {/* Top Header Row with "+ Add Resource" & View Toggle matching references */}
      <div className="cortex-top-action-row">
        <div className="cortex-top-section-title">
          <span className="cortex-top-title-icon">✦</span>
          <span>{options.length > 0 ? 'Clarification & Concept Choice' : 'Course Materials & Reference Handouts'}</span>
        </div>
        <div className="cortex-top-action-controls">
          <div className="cortex-view-mode-toggle">
            <button
              type="button"
              className={`cortex-mode-btn ${rightPanelView === 'branches' ? 'cortex-mode-btn--active' : ''}`}
              onClick={() => setRightPanelView('branches')}
              title="Show Interactive Concept Explanation Tree (Image 6)"
            >
              ✦ Concept Tree
            </button>
            <button
              type="button"
              className={`cortex-mode-btn ${rightPanelView === 'actions' ? 'cortex-mode-btn--active' : ''}`}
              onClick={() => setRightPanelView('actions')}
              title="Show Cyberpunk Actions: View, Download, Delete (Image 7 & 8)"
            >
              ⚙️ Actions
            </button>
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
      </div>

      {/* Main Layout: Main Cyan Card + SVG Circuit Tree + Chamfered Action Nodes */}
      <div className="cortex-card-layout" ref={layoutRef}>
        {/* The Main Card: Restored to clean, simple, rounded rectangle shape (#00e5ff / #070709) */}
        <div className="cortex-card-main" ref={cardRef}>
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

        {/* The Connections: Restored to smooth S-curve (Fluid Fiber) pattern with animated data flows */}
        <div className="cortex-tree-connector" ref={connectorRef} aria-hidden="true">
          <svg className="cortex-tree-svg" width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
              <filter id={`${svgId}-cyanGlow`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`${svgId}-roseGlow`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Branch 1: Curves UP to VIEW button (Cyan Fluid Fiber) */}
            <path
              d={topCurveD}
              className={`cortex-fiber-base cortex-fiber-base--cyan ${
                isViewOpen || hoveredNode === 'view' ? 'cortex-fiber-base--active' : ''
              }`}
              filter={`url(#${svgId}-cyanGlow)`}
            />
            <path d={topCurveD} className="cortex-fiber-dataflow" />

            {/* Branch 2: Smooth Middle Curve to DOWNLOAD button (Cyan Fluid Fiber) */}
            <path
              d={midCurveD}
              className={`cortex-fiber-base cortex-fiber-base--cyan ${
                downloadSuccess || hoveredNode === 'download' ? 'cortex-fiber-base--active' : ''
              }`}
              filter={`url(#${svgId}-cyanGlow)`}
            />
            <path d={midCurveD} className="cortex-fiber-dataflow" />

            {/* Branch 3: Curves DOWN to DELETE button / Branch 3 */}
            <path
              d={botCurveD}
              className={`cortex-fiber-base ${
                rightPanelView === 'branches' ? 'cortex-fiber-base--cyan' : 'cortex-fiber-base--rose'
              } ${isDeleted || hoveredNode === 'delete' ? 'cortex-fiber-base--active' : ''}`}
              filter={rightPanelView === 'branches' ? `url(#${svgId}-cyanGlow)` : `url(#${svgId}-roseGlow)`}
            />
            <path d={botCurveD} className="cortex-fiber-dataflow" />

            {/* Origin Junction Dot on Main Card Edge */}
            <circle cx="0" cy={coords.rootY} r="3" fill="#00e5ff" filter={`url(#${svgId}-cyanGlow)`} />

            {/* Terminal Dots entering each node */}
            <circle cx={coords.w} cy={coords.yView} r="2.5" fill="#00e5ff" />
            <circle cx={coords.w} cy={coords.yDownload} r="2.5" fill="#00e5ff" />
            <circle
              cx={coords.w}
              cy={coords.yDelete}
              r="2.5"
              fill={rightPanelView === 'branches' ? '#00e5ff' : '#f43f5e'}
            />
          </svg>
        </div>

        {/* The Branches (Nodes): Dual Mode (Image 6 Concept Tree vs Image 7/8 Cyber Actions) */}
        {rightPanelView === 'branches' ? (
          <div className="cortex-nodes-column cortex-nodes-column--branches">
            <div className="cortex-branches-header">
              <span className="cortex-branches-title">✦ INTERACTIVE EXPLANATION</span>
            </div>
            {branches.map((b, idx) => {
              const isNodeActive = isViewOpen && activeBranchIdx === idx;
              const ref = idx === 0 ? viewNodeRef : idx === 1 ? downloadNodeRef : deleteNodeRef;

              return (
                <button
                  key={b.id || idx}
                  ref={ref}
                  type="button"
                  className={`cortex-branch-card-node ${isNodeActive ? 'cortex-branch-card-node--active' : ''}`}
                  onClick={() => {
                    setActiveBranchIdx(idx);
                    setIsViewOpen(true);
                  }}
                  onMouseEnter={() => setHoveredNode(idx === 0 ? 'view' : idx === 1 ? 'download' : 'delete')}
                  onMouseLeave={() => setHoveredNode(null)}
                  title={`Click to view deep dive on ${b.title}`}
                >
                  <div className="cortex-branch-card-node__icon">{b.icon || '✦'}</div>
                  <div className="cortex-branch-card-node__body">
                    <div className="cortex-branch-card-node__title">{b.title}</div>
                    <div className="cortex-branch-card-node__badge">{b.badge || 'CONCEPT'}</div>
                  </div>
                  <div className="cortex-branch-card-node__chevron">&gt;</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="cortex-nodes-column">
            {/* Node 1: VIEW */}
            <button
              ref={viewNodeRef}
              type="button"
              className={`cortex-cyber-node cortex-cyber-node--view ${isViewOpen ? 'cortex-cyber-node--active' : ''}`}
              onClick={handleViewToggle}
              onMouseEnter={() => setHoveredNode('view')}
              onMouseLeave={() => setHoveredNode(null)}
              title="Click to view full interactive explanation"
            >
              <svg className="cortex-cyber-border-svg" preserveAspectRatio="none" viewBox="0 0 100 42">
                <polygon
                  points="10,1 99,1 99,32 89,41 1,41 1,11"
                  className="cortex-cyber-polygon cortex-cyber-polygon--cyan"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="cortex-cyber-inner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="cortex-cyber-label">{isViewOpen ? 'CLOSE' : 'VIEW'}</span>
              </div>
            </button>

            {/* Node 2: DOWNLOAD */}
            <button
              ref={downloadNodeRef}
              type="button"
              className={`cortex-cyber-node cortex-cyber-node--download ${
                downloadSuccess ? 'cortex-cyber-node--active' : ''
              }`}
              onClick={handleDownload}
              onMouseEnter={() => setHoveredNode('download')}
              onMouseLeave={() => setHoveredNode(null)}
              title="Download / Copy reference notes"
            >
              <svg className="cortex-cyber-border-svg" preserveAspectRatio="none" viewBox="0 0 100 42">
                <polygon
                  points="10,1 99,1 99,32 89,41 1,41 1,11"
                  className="cortex-cyber-polygon cortex-cyber-polygon--cyan"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="cortex-cyber-inner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="cortex-cyber-label">{downloadSuccess ? 'COPIED!' : 'DOWNLOAD'}</span>
              </div>
            </button>

            {/* Node 3: DELETE (Rose/Red) */}
            <button
              ref={deleteNodeRef}
              type="button"
              className={`cortex-cyber-node cortex-cyber-node--delete ${isDeleted ? 'cortex-cyber-node--active' : ''}`}
              onClick={handleDelete}
              onMouseEnter={() => setHoveredNode('delete')}
              onMouseLeave={() => setHoveredNode(null)}
              title="Reset or clear selection"
            >
              <svg className="cortex-cyber-border-svg" preserveAspectRatio="none" viewBox="0 0 100 42">
                <polygon
                  points="10,1 99,1 99,32 89,41 1,41 1,11"
                  className="cortex-cyber-polygon cortex-cyber-polygon--rose"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="cortex-cyber-inner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="cortex-cyber-label">{isDeleted ? 'CLEARED' : 'DELETE'}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* The Background: NO BLACKOUT OVERLAY! Attached inline drawer below the card */}
      {isViewOpen && (
        <div className="cortex-view-drawer" role="region" aria-label="Interactive Explanation">
          <div className="cortex-drawer-top-accent" />

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
              title="Close viewer"
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
