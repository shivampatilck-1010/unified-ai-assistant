import React, { useState, useEffect, useCallback } from 'react';
import type {
  ResearchJob,
  ResearchSource,
  ResearchEvent,
  ResearchDepth,
  FileMetadata,
} from '../../types';
import {
  createResearchJob,
  fetchResearchJobs,
  fetchResearchJobDetail,
  approveResearchJob,
  cancelResearchJob,
  exportResearchReportMarkdown,
  fetchFiles,
} from '../../lib/api';
import './WebResearchView.css';

export function WebResearchView() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ResearchJob | null>(null);
  const [activeSources, setActiveSources] = useState<ResearchSource[]>([]);
  const [activeEvents, setActiveEvents] = useState<ResearchEvent[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Form State
  const [showNewJobForm, setShowNewJobForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [allowedDomainsStr, setAllowedDomainsStr] = useState('');
  const [maxSources, setMaxSources] = useState(5);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<FileMetadata[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load jobs list
  const loadJobs = useCallback(async () => {
    try {
      setIsLoadingJobs(true);
      const res = await fetchResearchJobs({ limit: 30 });
      setJobs(res.items);
      if (res.items.length > 0 && !activeJobId) {
        setActiveJobId(res.items[0].id);
      }
    } catch (err) {
      console.error('Failed to load research jobs:', err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [activeJobId]);

  // Load available files for correlation
  const loadFiles = useCallback(async () => {
    try {
      const res = await fetchFiles();
      setAvailableFiles(res.items);
    } catch (err) {
      console.warn('Could not fetch user documents for research:', err);
    }
  }, []);

  // Load active job details & sources
  const loadActiveDetail = useCallback(async (jobId: string) => {
    try {
      setIsLoadingDetail(true);
      setActionError(null);
      const res = await fetchResearchJobDetail(jobId);
      setActiveJob(res.job);
      setActiveSources(res.sources);
      setActiveEvents(res.events);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to fetch job details');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadFiles();
  }, [loadJobs, loadFiles]);

  useEffect(() => {
    if (activeJobId) {
      void loadActiveDetail(activeJobId);
      // Poll active job while running/planning/synthesizing
      const timer = setInterval(() => {
        if (
          activeJob &&
          ['planning', 'awaiting_approval', 'running', 'synthesizing'].includes(activeJob.status)
        ) {
          void loadActiveDetail(activeJobId);
        }
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [activeJobId, activeJob, loadActiveDetail]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsSubmitting(true);
    setActionError(null);

    const domains = allowedDomainsStr
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);

    try {
      const newJob = await createResearchJob({
        question: question.trim(),
        depth,
        allowed_domains: domains.length > 0 ? domains : undefined,
        file_ids: selectedFileIds.length > 0 ? selectedFileIds : undefined,
        max_sources: maxSources,
        requires_approval: requiresApproval,
      });

      setQuestion('');
      setAllowedDomainsStr('');
      setSelectedFileIds([]);
      setShowNewJobForm(false);
      setActiveJobId(newJob.id);
      await loadJobs();
      await loadActiveDetail(newJob.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create research job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!activeJobId) return;
    try {
      setActionError(null);
      await approveResearchJob(activeJobId);
      await loadActiveDetail(activeJobId);
      await loadJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve plan');
    }
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    const reason = window.prompt('Reason for cancellation (optional):', 'Cancelled by user');
    if (reason === null) return;

    try {
      setActionError(null);
      await cancelResearchJob(activeJobId, reason || 'Cancelled by user');
      await loadActiveDetail(activeJobId);
      await loadJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel research job');
    }
  };

  const handleExportMarkdown = async () => {
    if (!activeJobId) return;
    try {
      const md = await exportResearchReportMarkdown(activeJobId);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research_report_${activeJobId.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  return (
    <div className="research-container">
      {/* Sidebar: Job History */}
      <aside className="research-sidebar">
        <div className="research-sidebar__header">
          <span className="research-sidebar__title">Research History</span>
          <button
            className="research-sidebar__new-btn"
            onClick={() => {
              setShowNewJobForm(true);
              setActiveJobId(null);
              setActiveJob(null);
            }}
          >
            + New Research
          </button>
        </div>

        <div className="research-sidebar__list">
          {isLoadingJobs && jobs.length === 0 ? (
            <div style={{ padding: '16px', color: '#737373', fontSize: '13px' }}>Loading investigations...</div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: '16px', color: '#737373', fontSize: '13px' }}>No research investigations yet.</div>
          ) : (
            jobs.map((j) => (
              <button
                key={j.id}
                className={`research-sidebar__item ${j.id === activeJobId ? 'research-sidebar__item--active' : ''}`}
                onClick={() => {
                  setShowNewJobForm(false);
                  setActiveJobId(j.id);
                }}
              >
                <div className="research-sidebar__item-header">
                  <span
                    className={`research-sidebar__item-depth ${
                      j.depth === 'deep' ? 'research-sidebar__item-depth--deep' : ''
                    }`}
                  >
                    {j.depth}
                  </span>
                  <span className={`research-status-pill research-status-pill--${j.status}`}>
                    {j.status}
                  </span>
                </div>
                <div className="research-sidebar__item-question" title={j.question}>
                  {j.question}
                </div>
                <div className="research-sidebar__item-date">
                  {new Date(j.created_at).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="research-main">
        <header className="research-header">
          <h1 className="research-header__title">Web Research & Browser Intelligence</h1>
          <p className="research-header__subtitle">
            Autonomous multi-source web investigations grounded in verified evidence, policy enforcement, and document correlation.
          </p>
        </header>

        {actionError && (
          <div style={{ background: '#3b1414', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>
            {actionError}
          </div>
        )}

        {/* Creator Form or Active Detail */}
        {showNewJobForm || !activeJobId ? (
          <div className="research-form-card">
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f5f5f5', margin: '0 0 4px 0' }}>
              Start New Research Investigation
            </h2>
            <form onSubmit={handleCreateJob} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label className="research-form__label">
                Research Question or Objective
                <textarea
                  className="research-form__textarea"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Compare recent advancements in solid-state lithium ceramic batteries versus sodium-ion cells..."
                  required
                />
              </label>

              <div className="research-form__row">
                <div className="research-form__col">
                  <label className="research-form__label">
                    Investigation Depth
                    <select
                      className="research-form__select"
                      value={depth}
                      onChange={(e) => {
                        const val = e.target.value as ResearchDepth;
                        setDepth(val);
                        if (val === 'deep') setRequiresApproval(true);
                      }}
                    >
                      <option value="quick">Quick (1-3 sources, fast overview)</option>
                      <option value="standard">Standard (3-5 sources, balanced)</option>
                      <option value="deep">Deep (Multi-step crawl, comprehensive)</option>
                    </select>
                  </label>
                </div>

                <div className="research-form__col">
                  <label className="research-form__label">
                    Max Web Sources
                    <input
                      type="number"
                      min={1}
                      max={15}
                      className="research-form__input"
                      value={maxSources}
                      onChange={(e) => setMaxSources(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <label className="research-form__label">
                Allowed Domain Scope (Optional comma-separated list)
                <input
                  type="text"
                  className="research-form__input"
                  value={allowedDomainsStr}
                  onChange={(e) => setAllowedDomainsStr(e.target.value)}
                  placeholder="e.g. nature.com, sciencedaily.com, reuters.com"
                />
              </label>

              {availableFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#d4d4d4' }}>
                    Correlate with Uploaded Documents (Phase 5 Knowledge Engine)
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', background: '#171717', padding: '10px', borderRadius: '6px', border: '1px solid #333' }}>
                    {availableFiles.map((file) => (
                      <label
                        key={file.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          background: selectedFileIds.includes(file.id) ? '#1e3a5f' : '#262626',
                          border: `1px solid ${selectedFileIds.includes(file.id) ? '#3b82f6' : '#333'}`,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFileIds.includes(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                        />
                        {file.filename}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="research-form__checkbox-label">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                />
                Require human plan review and approval before web crawling commences
              </label>

              <button
                type="submit"
                className="research-form__submit"
                disabled={isSubmitting || !question.trim()}
              >
                {isSubmitting ? 'Generating Plan...' : 'Initiate Research Investigation'}
              </button>
            </form>
          </div>
        ) : isLoadingDetail && !activeJob ? (
          <div style={{ padding: '32px', color: '#8c8c8c' }}>Loading investigation details...</div>
        ) : activeJob ? (
          <div className="research-detail-card">
            {/* Header info */}
            <div className="research-detail__header">
              <div>
                <h2 className="research-detail__question">{activeJob.question}</h2>
                <div className="research-detail__meta">
                  <span>Depth: <strong>{activeJob.depth}</strong></span>
                  <span>•</span>
                  <span>Created: {new Date(activeJob.created_at).toLocaleString()}</span>
                  {activeJob.allowed_domains && activeJob.allowed_domains.length > 0 && (
                    <>
                      <span>•</span>
                      <span>Domains: {activeJob.allowed_domains.join(', ')}</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`research-status-pill research-status-pill--${activeJob.status}`}>
                  {activeJob.status}
                </span>
                {['planning', 'running', 'synthesizing', 'awaiting_approval'].includes(activeJob.status) && (
                  <button className="research-btn--cancel" onClick={handleCancel}>
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Plan Approval Box */}
            {activeJob.status === 'awaiting_approval' && activeJob.plan && (
              <div className="research-plan-box">
                <div className="research-plan-box__title">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Proposed Research Plan Awaiting Your Confirmation
                </div>
                <div className="research-plan-box__rationale">{activeJob.plan.rationale}</div>
                <ol className="research-plan-box__steps">
                  {activeJob.plan.steps.map((st) => (
                    <li key={st.step_number}>
                      <span className="research-plan-box__step-action">[{st.action}]</span>
                      <span className="research-plan-box__step-desc">
                        {st.query_or_target} — <em>{st.rationale}</em>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="research-plan-box__actions">
                  <button className="research-btn--approve" onClick={handleApprove}>
                    Approve Plan & Launch Crawler
                  </button>
                  <button className="research-btn--cancel" onClick={handleCancel}>
                    Reject & Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Live Progress Timeline */}
            {activeEvents.length > 0 && (
              <div className="research-timeline">
                {activeEvents.slice(-6).map((evt) => (
                  <div key={evt.id} className="research-timeline__item">
                    <span className="research-timeline__time">
                      {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="research-timeline__msg">{evt.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Synthesized Report Viewer */}
            {activeJob.final_report && (
              <div className="research-report-viewer">
                <div className="research-report__top-bar">
                  <h3 className="research-report__title">{activeJob.final_report.title}</h3>
                  <button className="research-report__export-btn" onClick={handleExportMarkdown}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Export to Markdown
                  </button>
                </div>

                <div>
                  <h4 className="research-report__section-title">Executive Summary</h4>
                  <p className="research-report__prose">{activeJob.final_report.executive_summary}</p>
                </div>

                <div>
                  <h4 className="research-report__section-title">Key Findings</h4>
                  <ul className="research-report__findings">
                    {activeJob.final_report.key_findings.map((f, idx) => (
                      <li key={idx} className="research-report__finding-item">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="research-report__section-title">Evidence & Analysis</h4>
                  <div className="research-report__prose" style={{ whiteSpace: 'pre-line' }}>
                    {activeJob.final_report.evidence_and_analysis}
                  </div>
                </div>

                {activeJob.final_report.conflicting_claims && activeJob.final_report.conflicting_claims.length > 0 && (
                  <div className="research-conflict-box">
                    <div className="research-conflict-box__title">⚠️ Conflicting Claims Detected Across Sources</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#fca5a5', fontSize: '13px' }}>
                      {activeJob.final_report.conflicting_claims.map((c, idx) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeJob.final_report.limitations_and_unresolved && activeJob.final_report.limitations_and_unresolved.length > 0 && (
                  <div>
                    <h4 className="research-report__section-title">Limitations & Gaps</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#a3a3a3', fontSize: '13px' }}>
                      {activeJob.final_report.limitations_and_unresolved.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeJob.final_report.citations && activeJob.final_report.citations.length > 0 && (
                  <div>
                    <h4 className="research-report__section-title">Traceable Source Citations</h4>
                    <div className="research-citations-list">
                      {activeJob.final_report.citations.map((cit, idx) => (
                        <div key={idx} className="research-citation-card">
                          <div>
                            <span className="research-citation-card__tag">{cit.citation_tag}</span>
                            {cit.citation_type === 'web' ? (
                              <a
                                href={cit.url_or_filename}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="research-citation-card__link"
                              >
                                {cit.title}
                              </a>
                            ) : (
                              <span style={{ color: '#e5e5e5', fontWeight: 500 }}>
                                📄 {cit.url_or_filename} {cit.page_number ? `(Page ${cit.page_number})` : ''}
                              </span>
                            )}
                          </div>
                          {cit.snippet && (
                            <div className="research-citation-card__snippet">"{cit.snippet}"</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Collected Sources Grid */}
            <div className="research-sources-section">
              <h3 className="research-sources-section__title">
                Discovered & Crawled Web Sources ({activeSources.length})
              </h3>
              {activeSources.length === 0 ? (
                <div style={{ color: '#737373', fontSize: '13px' }}>No sources crawled yet.</div>
              ) : (
                <div className="research-sources-grid">
                  {activeSources.map((s) => (
                    <div key={s.id} className="research-source-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#a3a3a3' }}>{s.publisher}</span>
                          <span className={`research-source-badge research-source-badge--${s.validation_status}`}>
                            {s.validation_status}
                          </span>
                        </div>
                        <a
                          href={s.canonical_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="research-source-card__title"
                          title={s.title}
                        >
                          {s.title}
                        </a>
                      </div>

                      {s.snippets && s.snippets.length > 0 && (
                        <div className="research-source-card__snippet">
                          "{s.snippets[0]}"
                        </div>
                      )}

                      <div className="research-source-card__meta">
                        <span>{s.publication_date ? `Pub: ${s.publication_date}` : 'Date: Unverified'}</span>
                        {s.content_hash && (
                          <span title={`SHA256: ${s.content_hash}`}>
                            Hash: {s.content_hash.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
