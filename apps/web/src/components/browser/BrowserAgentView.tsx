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
  fetchBrowserTaskEvents,
  getBrowserStreamUrl,
} from '../../lib/api';
import { WebResearchView } from '../research/WebResearchView';
import { BrowserLivePreviewCard } from './BrowserLivePreviewCard';
import './BrowserAgentView.css';

export function BrowserAgentView() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'research'>('tasks');
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
      const res = await listBrowserTasks(10, 0);
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
    void fetchBrowserTaskEvents(activeTaskId).then((evs) => {
      setEvents(evs);
    }).catch(() => {});

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

  return (
    <div className="browser-agent">
      {/* Top Tab Bar: Tasks vs Web Research */}
      <div className="browser-agent__tabs">
        <button
          className={`browser-agent__tab-btn ${activeTab === 'tasks' ? 'browser-agent__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Autonomous Tasks
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
              <span className="browser-agent__tag">Phase 3 Autonomous Agent</span>
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
        {/* Left Column: Creator and Recent Runs */}
        <div className="browser-agent__sidebar">
          <div className="browser-agent__section-title">New Browser Task</div>
          <form className="browser-agent__form" onSubmit={handleCreateTask}>
            <label className="browser-agent__label">
              <span>Goal or Intent</span>
              <textarea
                className="browser-agent__textarea"
                rows={3}
                placeholder="e.g. Visit https://news.ycombinator.com and extract top headline"
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
              <span>Initial URL (Optional)</span>
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
              {isSubmitting ? 'Generating Plan...' : 'Generate Plan'}
            </button>
          </form>

          {/* Recent Tasks */}
          <div className="browser-agent__recent">
            <div className="browser-agent__section-title">Recent Tasks</div>
            {recentTasks.length === 0 ? (
              <div className="browser-agent__empty-list">No recent tasks.</div>
            ) : (
              <ul className="browser-agent__task-list">
                {recentTasks.map((t) => (
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
                      <span>{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Execution Workspace */}
        <div className="browser-agent__workspace">
          {!activeTask ? (
            <div className="browser-agent__placeholder">
              <h3>No Active Task Selected</h3>
              <p>Create a new task on the left or select a previous run to inspect plan, execution progress, and evidence.</p>
            </div>
          ) : (
            <div className="browser-agent__detail">
              {/* Task Header */}
              <div className="browser-agent__detail-header">
                <div>
                  <h2 className="browser-agent__detail-title">{activeTask.task_description}</h2>
                  <div className="browser-agent__detail-sub">
                    <span className={`browser-agent__status-pill browser-agent__status-pill--${activeTask.status}`}>
                      {activeTask.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span>Task ID: {activeTask.id.slice(0, 8)}</span>
                    {activeTask.approved_scope?.allowed_domains && (
                      <span>Scope: {activeTask.approved_scope.allowed_domains.join(', ') || 'Unrestricted'}</span>
                    )}
                  </div>
                </div>

                <div className="browser-agent__header-actions">
                  {activeTask.status === 'awaiting_approval' && (
                    <button
                      className="browser-agent__btn browser-agent__btn--primary"
                      onClick={handleApprove}
                      disabled={isActionPending}
                    >
                      Approve & Run Plan
                    </button>
                  )}

                  {['running', 'awaiting_confirmation', 'awaiting_approval'].includes(activeTask.status) && (
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

              {/* Real-time Viewport & Interactive Stream */}
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
                      <div className="browser-agent__confirmation-title">Human Confirmation Required</div>
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

              {/* Verified Result Summary */}
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
                        {typeof ev.injection_warning === 'string' && (
                          <div className="browser-agent__evidence-warn">
                            <strong>Security Audit:</strong> {ev.injection_warning}
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
                        <div className={`browser-agent__timeline-dot browser-agent__timeline-dot--${ev.event_type}`} />
                        <div className="browser-agent__timeline-content">
                          <div className="browser-agent__timeline-type">{ev.event_type.replace('_', ' ')}</div>
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
