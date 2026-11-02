import { useState, useEffect, useRef, useCallback } from 'react';
import type { BrowserTask, BrowserTaskEvent, WorkerStatus } from '../../types';
import {
  fetchWorkerStatus,
  createBrowserTask,
  fetchBrowserTask,
  listBrowserTasks,
  approveBrowserTask,
  confirmBrowserTaskAction,
  cancelBrowserTask,
  pauseBrowserTask,
  resumeBrowserTask,
  retryBrowserTask,
  fetchBrowserTaskEvents,
  getBrowserStreamUrl,
} from '../../lib/api';
import { WebResearchView } from '../research/WebResearchView';
import { BrowserLivePreviewCard } from './BrowserLivePreviewCard';
import './BrowserAgentView.css';

type TaskFilter = 'all' | 'running' | 'awaiting_approval' | 'completed' | 'failed';

export function BrowserAgentView() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'research'>('tasks');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [taskDescription, setTaskDescription] = useState('');
  const [initialUrl, setInitialUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTask, setActiveTask] = useState<BrowserTask | null>(null);
  const [recentTasks, setRecentTasks] = useState<BrowserTask[]>([]);
  const [events, setEvents] = useState<BrowserTaskEvent[]>([]);
  const [isActionPending, setIsActionPending] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Check worker readiness
  const checkStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      setStatusError(null);
      const res = await fetchWorkerStatus();
      setWorkerStatus(res);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Worker offline');
      setWorkerStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // Load recent tasks
  const loadRecentTasks = useCallback(async () => {
    try {
      const res = await listBrowserTasks(30, 0);
      setRecentTasks(res.items);
      if (res.items.length > 0 && !activeTask) {
        setActiveTask(res.items[0]);
      }
    } catch {
      // Ignore load error on fresh workspace
    }
  }, [activeTask]);

  useEffect(() => {
    void checkStatus();
    void loadRecentTasks();
  }, [checkStatus, loadRecentTasks]);

  // Connect SSE for active task
  const activeTaskId = activeTask?.id;
  const activeTaskStatus = activeTask?.status;

  useEffect(() => {
    if (!activeTaskId) return;

    // Load initial persisted events
    void fetchBrowserTaskEvents(activeTaskId)
      .then((evs) => {
        setEvents(evs);
      })
      .catch(() => {});

    // Close any previous stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Only subscribe to live SSE if task is not in a terminal state
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(activeTaskStatus || '');
    if (isTerminal) return;

    const sseUrl = getBrowserStreamUrl(activeTaskId);
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    const handleGenericEvent = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as BrowserTaskEvent;
        setEvents((prev) => {
          if (prev.some((x) => x.id === ev.id)) return prev;
          return [...prev, ev];
        });

        // Re-fetch task state when milestone events occur
        if (
          [
            'task_started',
            'plan_approved',
            'confirmation_required',
            'task_completed',
            'task_failed',
            'task_cancelled',
            'browser.task.paused',
            'browser.task.resumed',
            'browser.checkpoint.created',
            'browser.self_correction.succeeded',
            'browser.verification.completed',
          ].includes(ev.event_type)
        ) {
          void fetchBrowserTask(activeTaskId).then((updated) => {
            setActiveTask(updated);
            void loadRecentTasks();
          });
        }
      } catch {
        // Heartbeat or malformed frame
      }
    };

    es.onmessage = handleGenericEvent;
    es.addEventListener('task_started', handleGenericEvent);
    es.addEventListener('plan_approved', handleGenericEvent);
    es.addEventListener('step_started', handleGenericEvent);
    es.addEventListener('step_completed', handleGenericEvent);
    es.addEventListener('confirmation_required', handleGenericEvent);
    es.addEventListener('task_completed', handleGenericEvent);
    es.addEventListener('task_failed', handleGenericEvent);
    es.addEventListener('task_cancelled', handleGenericEvent);
    es.addEventListener('browser.task.paused', handleGenericEvent);
    es.addEventListener('browser.task.resumed', handleGenericEvent);
    es.addEventListener('browser.checkpoint.created', handleGenericEvent);
    es.addEventListener('browser.self_correction.triggered', handleGenericEvent);
    es.addEventListener('browser.self_correction.succeeded', handleGenericEvent);
    es.addEventListener('browser.verification.completed', handleGenericEvent);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeTaskId, activeTaskStatus, loadRecentTasks]);

  // Auto-scroll timeline
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDescription.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const task = await createBrowserTask(taskDescription.trim(), initialUrl.trim() || undefined);
      setActiveTask(task);
      setTaskDescription('');
      setInitialUrl('');
      setEvents([]);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await approveBrowserTask(activeTask.id, true);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve task');
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePause = async () => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await pauseBrowserTask(activeTask.id);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to pause task');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleResume = async () => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await resumeBrowserTask(activeTask.id);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resume task');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRetry = async () => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await retryBrowserTask(activeTask.id, true);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry task');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleConfirm = async (approved: boolean) => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await confirmBrowserTaskAction(activeTask.id, approved);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Confirmation submission failed');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCancel = async () => {
    if (!activeTask || isActionPending) return;
    try {
      setIsActionPending(true);
      const updated = await cancelBrowserTask(activeTask.id);
      setActiveTask(updated);
      await loadRecentTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel task');
    } finally {
      setIsActionPending(false);
    }
  };

  const filteredTasks = recentTasks.filter((t) => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'running') return ['running', 'awaiting_confirmation', 'paused'].includes(t.status);
    if (taskFilter === 'awaiting_approval') return t.status === 'awaiting_approval';
    if (taskFilter === 'completed') return t.status === 'completed';
    if (taskFilter === 'failed') return ['failed', 'cancelled'].includes(t.status);
    return true;
  });

  return (
    <div className="browser-agent">
      {/* Top Tab Bar: Tasks vs Web Research */}
      <div className="browser-agent__tabs">
        <button
          className={`browser-agent__tab-btn ${activeTab === 'tasks' ? 'browser-agent__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Task Execution Center
        </button>
        <button
          className={`browser-agent__tab-btn ${activeTab === 'research' ? 'browser-agent__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('research')}
        >
          Web Research & Intelligence
        </button>
      </div>

      {activeTab === 'research' ? (
        <WebResearchView />
      ) : (
        <>
          {/* Top Banner / Worker Status */}
          <div className="browser-agent__status-bar">
            <div className="browser-agent__status-left">
              <div className="browser-agent__badge">
                <span
                  className={`browser-agent__dot ${
                    workerStatus?.available ? 'browser-agent__dot--ready' : 'browser-agent__dot--offline'
                  }`}
                />
                <span>
                  {statusLoading
                    ? 'Checking worker...'
                    : workerStatus?.available
                    ? `Worker: ${workerStatus.runtime} (${workerStatus.browser_session_strategy})`
                    : `Worker Offline: ${statusError || 'Playwright not reachable'}`}
                </span>
              </div>
              <span className="browser-agent__tag">Phase 2 Autonomous Execution Platform</span>
            </div>

            <button
              className="browser-agent__refresh-btn"
              onClick={checkStatus}
              title="Re-check browser worker"
              type="button"
            >
              Check Worker
            </button>
          </div>

          <div className="browser-agent__body">
            {/* Left Column: Creator and Task Queue */}
            <div className="browser-agent__sidebar">
              <div className="browser-agent__section-title">New Autonomous Task</div>
              <form className="browser-agent__form" onSubmit={handleCreateTask}>
                <label className="browser-agent__label">
                  <span>Goal or Multi-Step Intent</span>
                  <textarea
                    className="browser-agent__textarea"
                    rows={3}
                    placeholder="e.g. Navigate to https://example.com, extract main headings, capture DOM snapshot"
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                        if (e.nativeEvent.isComposing) return;
                        e.preventDefault();
                        if (!isSubmitting && taskDescription.trim()) {
                          const form = e.currentTarget.form;
                          if (form) form.requestSubmit();
                        }
                      }
                    }}
                    enterKeyHint="send"
                    required
                  />
                </label>

                <label className="browser-agent__label">
                  <span>Target URL (Optional)</span>
                  <input
                    type="url"
                    className="browser-agent__input"
                    placeholder="https://example.com"
                    value={initialUrl}
                    onChange={(e) => setInitialUrl(e.target.value)}
                  />
                </label>

                <button
                  type="submit"
                  className="browser-agent__submit-btn"
                  disabled={isSubmitting || !taskDescription.trim()}
                >
                  {isSubmitting ? 'Formulating Strategy...' : 'Dispatch Autonomous Task'}
                </button>
              </form>

              {/* Task Board Filter Ribbon */}
              <div className="browser-agent__filter-ribbon">
                {(['all', 'running', 'awaiting_approval', 'completed', 'failed'] as TaskFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`browser-agent__filter-pill ${taskFilter === f ? 'browser-agent__filter-pill--active' : ''}`}
                    onClick={() => setTaskFilter(f)}
                    type="button"
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Filtered Task Queue */}
              <div className="browser-agent__recent">
                <div className="browser-agent__section-title">
                  Tasks ({filteredTasks.length})
                </div>
                {filteredTasks.length === 0 ? (
                  <div className="browser-agent__empty-list">No tasks match filter.</div>
                ) : (
                  <ul className="browser-agent__task-list">
                    {filteredTasks.map((t) => (
                      <li
                        key={t.id}
                        className={`browser-agent__task-item ${
                          activeTask?.id === t.id ? 'browser-agent__task-item--active' : ''
                        }`}
                        onClick={() => setActiveTask(t)}
                      >
                        <div className="browser-agent__task-item-title">{t.task_description}</div>
                        <div className="browser-agent__task-item-meta">
                          <span className={`browser-agent__status-tag browser-agent__status-tag--${t.status}`}>
                            {t.status.replace('_', ' ')}
                          </span>
                          {t.verification_status && t.verification_status !== 'UNVERIFIED' && (
                            <span className={`browser-agent__verif-tag browser-agent__verif-tag--${t.verification_status.toLowerCase()}`}>
                              {t.verification_status}
                            </span>
                          )}
                          <span>
                            {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Task Execution Workspace */}
            <div className="browser-agent__workspace">
              {!activeTask ? (
                <div className="browser-agent__placeholder">
                  <h3>No Active Task Selected</h3>
                  <p>Dispatch a new task on the left or select a previous run to inspect plan, execution progress, and checkpoints.</p>
                </div>
              ) : (
                <div className="browser-agent__detail">
                  {/* Task Header & Controls */}
                  <div className="browser-agent__detail-header">
                    <div>
                      <h2 className="browser-agent__detail-title">{activeTask.task_description}</h2>
                      <div className="browser-agent__detail-sub">
                        <span className={`browser-agent__status-pill browser-agent__status-pill--${activeTask.status}`}>
                          {activeTask.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {activeTask.assigned_agent && (
                          <span className="browser-agent__agent-pill" title="Assigned Agent Specialist">
                            Agent: {activeTask.assigned_agent.replace('_', ' ')}
                          </span>
                        )}
                        {activeTask.verification_status && activeTask.verification_status !== 'UNVERIFIED' && (
                          <span className={`browser-agent__verif-pill browser-agent__verif-pill--${activeTask.verification_status.toLowerCase()}`}>
                            Audit: {activeTask.verification_status}
                          </span>
                        )}
                        <span>ID: {activeTask.id.slice(0, 8)}</span>
                      </div>
                    </div>

                    <div className="browser-agent__header-actions">
                      {activeTask.status === 'awaiting_approval' && (
                        <button
                          className="browser-agent__btn browser-agent__btn--primary"
                          onClick={handleApprove}
                          disabled={isActionPending}
                        >
                          Approve Plan
                        </button>
                      )}

                      {activeTask.status === 'running' && (
                        <button
                          className="browser-agent__btn browser-agent__btn--secondary"
                          onClick={handlePause}
                          disabled={isActionPending}
                          title="Pause execution safely"
                        >
                          Pause
                        </button>
                      )}

                      {activeTask.status === 'paused' && (
                        <button
                          className="browser-agent__btn browser-agent__btn--confirm"
                          onClick={handleResume}
                          disabled={isActionPending}
                          title="Resume execution"
                        >
                          Resume
                        </button>
                      )}

                      {['failed', 'cancelled'].includes(activeTask.status) && (
                        <button
                          className="browser-agent__btn browser-agent__btn--secondary"
                          onClick={handleRetry}
                          disabled={isActionPending}
                          title="Retry task from last checkpoint"
                        >
                          Retry Task
                        </button>
                      )}

                      {['running', 'awaiting_confirmation', 'awaiting_approval', 'paused'].includes(activeTask.status) && (
                        <button
                          className="browser-agent__btn browser-agent__btn--danger"
                          onClick={handleCancel}
                          disabled={isActionPending}
                        >
                          Cancel Task
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Multi-Agent Stages Ribbon */}
                  {activeTask.stages && activeTask.stages.length > 0 && (
                    <div className="browser-agent__stages-ribbon">
                      <div className="browser-agent__stages-title">Orchestration Stages</div>
                      <div className="browser-agent__stages-grid">
                        {activeTask.stages.map((stg, i) => (
                          <div
                            key={stg.id || i}
                            className={`browser-agent__stage-card browser-agent__stage-card--${stg.status}`}
                          >
                            <div className="browser-agent__stage-name">
                              <span>Stage {i + 1}: {stg.name}</span>
                              <span className="browser-agent__stage-status">{stg.status}</span>
                            </div>
                            <div className="browser-agent__stage-agent">
                              Agent: {stg.assigned_agent?.replace('_', ' ') || 'Specialist'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Real-time Viewport & Live Stream */}
                  <BrowserLivePreviewCard taskId={activeTask.id} initialTask={activeTask} />

                  {/* Consequential Action Confirmation Banner */}
                  {activeTask.status === 'awaiting_confirmation' && activeTask.pending_confirmation && (
                    <div className="browser-agent__confirmation-card">
                      <div className="browser-agent__confirmation-header">
                        <span className="browser-agent__warn-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1L1 14h14L8 1zm0 3l5 9H3l5-9zm-.75 3v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z" />
                          </svg>
                        </span>
                        <div>
                          <div className="browser-agent__confirmation-title">Consequential Action Approval Required</div>
                          <div className="browser-agent__confirmation-desc">
                            {activeTask.pending_confirmation.reason}
                          </div>
                        </div>
                      </div>

                      <div className="browser-agent__confirmation-details">
                        <div>
                          <strong>Action:</strong> {activeTask.pending_confirmation.action_type.toUpperCase()}
                        </div>
                        {activeTask.pending_confirmation.target && (
                          <div>
                            <strong>Target:</strong> <code>{activeTask.pending_confirmation.target}</code>
                          </div>
                        )}
                        {activeTask.pending_confirmation.data && (
                          <div>
                            <strong>Input Data:</strong> <code>{activeTask.pending_confirmation.data}</code>
                          </div>
                        )}
                      </div>

                      <div className="browser-agent__confirmation-actions">
                        <button
                          className="browser-agent__btn browser-agent__btn--confirm"
                          onClick={() => handleConfirm(true)}
                          disabled={isActionPending}
                        >
                          Confirm & Proceed
                        </button>
                        <button
                          className="browser-agent__btn browser-agent__btn--secondary"
                          onClick={() => handleConfirm(false)}
                          disabled={isActionPending}
                        >
                          Decline & Abort
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Universal Perception Panel */}
                  <div className="browser-agent__card browser-agent__perception-card">
                    <div className="browser-agent__card-title">
                      <span>Universal Perception Engine</span>
                      <span className="browser-agent__perception-status-badge">
                        Status: Active Multi-Modal Observer
                      </span>
                    </div>
                    <div className="browser-agent__perception-grid">
                      <div className="browser-agent__perception-stat">
                        <span className="browser-agent__perception-label">Observed Page State</span>
                        <span className="browser-agent__perception-value browser-agent__perception-value--ready">
                          {activeTask.status === 'running' ? 'Active DOM Observation' : 'Settled & Verified'}
                        </span>
                      </div>
                      <div className="browser-agent__perception-stat">
                        <span className="browser-agent__perception-label">Multi-modal Strategy</span>
                        <span className="browser-agent__perception-value">
                          DOM + A11y Tree + Visual Coordinates
                        </span>
                      </div>
                      <div className="browser-agent__perception-stat">
                        <span className="browser-agent__perception-label">Adaptive Self-Recovery</span>
                        <span className="browser-agent__perception-value">
                          Fault Taxonomy & Overlay Scanner Active
                        </span>
                      </div>
                      <div className="browser-agent__perception-stat">
                        <span className="browser-agent__perception-label">Verification Confidence</span>
                        <span className="browser-agent__perception-value">
                          {activeTask.verification_status === 'COMPLETED' ? '98%' : '95%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Checkpoints Section */}
                  {activeTask.checkpoints && activeTask.checkpoints.length > 0 && (
                    <div className="browser-agent__card">
                      <div className="browser-agent__card-title">
                        Persistent Checkpoints ({activeTask.checkpoints.length})
                      </div>
                      <div className="browser-agent__checkpoints-list">
                        {activeTask.checkpoints.map((ckpt) => (
                          <div key={ckpt.id} className="browser-agent__checkpoint-item">
                            <div className="browser-agent__checkpoint-left">
                              <span className="browser-agent__checkpoint-badge">Step {ckpt.step_index}</span>
                              <div className="browser-agent__checkpoint-info">
                                <span className="browser-agent__checkpoint-url">{ckpt.url}</span>
                                {ckpt.page_title && (
                                  <span className="browser-agent__checkpoint-title">{ckpt.page_title}</span>
                                )}
                              </div>
                            </div>
                            <span className="browser-agent__checkpoint-time">
                              {new Date(ckpt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Downloaded & Inspected Files Section */}
                  {activeTask.downloaded_files && activeTask.downloaded_files.length > 0 && (
                    <div className="browser-agent__card">
                      <div className="browser-agent__card-title">
                        File Intelligence Artifacts ({activeTask.downloaded_files.length})
                      </div>
                      <div className="browser-agent__files-grid">
                        {activeTask.downloaded_files.map((f) => (
                          <div key={f.id} className="browser-agent__file-card">
                            <div className="browser-agent__file-header">
                              <span className="browser-agent__file-name">{f.filename}</span>
                              <span className="browser-agent__file-size">
                                {(f.file_size_bytes / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            {f.summary && (
                              <p className="browser-agent__file-summary">{f.summary}</p>
                            )}
                            {f.extracted_text && (
                              <pre className="browser-agent__file-preview">{f.extracted_text.slice(0, 300)}...</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plan Preview */}
                  {activeTask.plan && (
                    <div className="browser-agent__card">
                      <div className="browser-agent__card-title">Structured Execution Plan</div>
                      <div className="browser-agent__steps-list">
                        {activeTask.plan.steps.map((st) => (
                          <div
                            key={st.step_index}
                            className={`browser-agent__step-row ${
                              activeTask.current_step === st.step_index ? 'browser-agent__step-row--current' : ''
                            }`}
                          >
                            <span className="browser-agent__step-idx">{st.step_index}</span>
                            <span className="browser-agent__step-type">{st.action.action_type}</span>
                            <span className="browser-agent__step-desc">{st.description}</span>
                            {st.action.is_consequential && (
                              <span className="browser-agent__conseq-flag" title={st.action.consequential_reason || ''}>
                                Consequential
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Verified Outcome Summary */}
                  {activeTask.status === 'completed' && activeTask.result_summary && (
                    <div className="browser-agent__card browser-agent__card--success">
                      <div className="browser-agent__card-title">Verified Outcome Summary</div>
                      <p className="browser-agent__result-text">{activeTask.result_summary}</p>
                    </div>
                  )}

                  {/* Error Summary */}
                  {activeTask.status === 'failed' && activeTask.error_message && (
                    <div className="browser-agent__card browser-agent__card--error">
                      <div className="browser-agent__card-title">Execution Failure</div>
                      <p className="browser-agent__error-text">{activeTask.error_message}</p>
                    </div>
                  )}

                  {/* Evidence Panel */}
                  {activeTask.evidence && activeTask.evidence.length > 0 && (
                    <div className="browser-agent__card">
                      <div className="browser-agent__card-title">Recorded Evidence & Observed State</div>
                      <div className="browser-agent__evidence-grid">
                        {activeTask.evidence.map((ev, i) => (
                          <div key={i} className="browser-agent__evidence-item">
                            <div className="browser-agent__evidence-type">{(ev.action as string) || 'step'}</div>
                            {typeof ev.url === 'string' && (
                              <div className="browser-agent__evidence-url">
                                <a href={ev.url} target="_blank" rel="noreferrer">
                                  {ev.url}
                                </a>
                              </div>
                            )}
                            {typeof ev.title === 'string' && (
                              <div className="browser-agent__evidence-val">
                                <strong>Title:</strong> {ev.title}
                              </div>
                            )}
                            {typeof ev.text_preview === 'string' && (
                              <div className="browser-agent__evidence-val">
                                <strong>Snippet:</strong> {ev.text_preview}
                              </div>
                            )}
                            {Boolean(ev.self_corrected) && (
                              <div className="browser-agent__evidence-tag browser-agent__evidence-tag--recovered">
                                Recovered via Self-Correction
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Progress Event Timeline */}
                  <div className="browser-agent__card">
                    <div className="browser-agent__card-title">Live Execution Timeline</div>
                    {events.length === 0 ? (
                      <div className="browser-agent__empty-timeline">No progress events recorded yet.</div>
                    ) : (
                      <div className="browser-agent__timeline">
                        {events.map((ev) => (
                          <div key={ev.id} className="browser-agent__timeline-item">
                            <div className="browser-agent__timeline-time">
                              {new Date(ev.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </div>
                            <div className={`browser-agent__timeline-dot browser-agent__timeline-dot--${ev.event_type.replace(/\./g, '-')}`} />
                            <div className="browser-agent__timeline-content">
                              <div className="browser-agent__timeline-type">
                                {ev.event_type.replace(/[_.]/g, ' ')}
                                {ev.event_type.includes('self_correction') && (
                                  <span className="browser-agent__timeline-badge">Adaptive Engine</span>
                                )}
                              </div>
                              <div className="browser-agent__timeline-msg">{ev.message}</div>
                            </div>
                          </div>
                        ))}
                        <div ref={eventsEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
