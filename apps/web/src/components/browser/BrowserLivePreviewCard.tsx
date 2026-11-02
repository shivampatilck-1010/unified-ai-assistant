import React, { useState, useEffect, useRef } from 'react';
import type { BrowserTask, BrowserTaskEvent } from '../../types';
import {
  fetchBrowserTask,
  cancelBrowserTask,
  confirmBrowserTaskAction,
  getBrowserStreamUrl,
  pauseBrowserTask,
  resumeBrowserTask,
  fetchBrowserTaskScreenshot,
} from '../../lib/api';
import './BrowserLivePreviewCard.css';

interface BrowserLivePreviewCardProps {
  taskId: string;
  initialTask?: BrowserTask | null;
  onClose?: () => void;
  compact?: boolean;
}

export const BrowserLivePreviewCard: React.FC<BrowserLivePreviewCardProps> = ({
  taskId,
  initialTask,
  onClose,
  compact = false,
}) => {
  const [task, setTask] = useState<BrowserTask | null>(initialTask || null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [latestActionText, setLatestActionText] = useState<string>('Initializing browser engine...');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(initialTask?.current_step || 0);
  const [totalSteps, setTotalSteps] = useState<number>(initialTask?.plan?.estimated_steps || 3);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial load of task details and initial screenshot
  useEffect(() => {
    let active = true;
    void fetchBrowserTask(taskId)
      .then((t) => {
        if (!active) return;
        setTask(t);
        setCurrentStepIndex(t.current_step || 0);
        if (t.plan?.estimated_steps) {
          setTotalSteps(t.plan.estimated_steps);
        }
      })
      .catch(() => {});

    void fetchBrowserTaskScreenshot(taskId)
      .then((data) => {
        if (!active || !data?.screenshot_data_url) return;
        setScreenshotUrl(data.screenshot_data_url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [taskId]);

  // Connect SSE progress stream
  useEffect(() => {
    if (!taskId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const sseUrl = getBrowserStreamUrl(taskId);
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    const handleMessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as BrowserTaskEvent;

        if (ev.step_index !== undefined && ev.step_index !== null) {
          setCurrentStepIndex(ev.step_index);
        }

        if (ev.message) {
          setLatestActionText(ev.message);
        }

        // Handle screenshot update event
        if (
          ev.event_type === 'browser.screenshot.updated' ||
          ev.event_type === 'screenshot_updated' ||
          ev.payload?.screenshot_data_url
        ) {
          const url = (ev.payload?.screenshot_data_url as string) || (ev.payload?.url as string);
          if (url && url.startsWith('data:image')) {
            setScreenshotUrl(url);
          }
        }

        // Status update transitions
        if (
          [
            'task_started',
            'browser.session.created',
            'plan_approved',
            'confirmation_required',
            'browser.task.paused',
            'browser.task.resumed',
            'task_completed',
            'task_failed',
            'task_cancelled',
          ].includes(ev.event_type)
        ) {
          void fetchBrowserTask(taskId).then((t) => {
            setTask(t);
            if (t.plan?.estimated_steps) {
              setTotalSteps(t.plan.estimated_steps);
            }
          });
        }
      } catch {
        // Heartbeat or comment
      }
    };

    es.onmessage = handleMessage;
    // Also listen to typed named events
    const typedEvents = [
      'browser.session.created',
      'browser.navigation.started',
      'browser.screenshot.updated',
      'browser.action.started',
      'browser.action.completed',
      'browser.task.progress',
      'browser.task.paused',
      'browser.task.resumed',
      'browser.task.completed',
      'browser.task.failed',
      'browser.session.closed',
      'step_started',
      'step_completed',
      'confirmation_required',
      'task_completed',
      'task_failed',
      'task_cancelled',
    ];
    for (const evt of typedEvents) {
      es.addEventListener(evt, handleMessage);
    }

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [taskId]);

  const handlePause = async () => {
    try {
      setIsActionPending(true);
      await pauseBrowserTask(taskId);
      setTask((prev) => (prev ? { ...prev, status: 'paused' } : prev));
    } catch (err) {
      console.error('Failed to pause browser task:', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleResume = async () => {
    try {
      setIsActionPending(true);
      await resumeBrowserTask(taskId);
      setTask((prev) => (prev ? { ...prev, status: 'running' } : prev));
    } catch (err) {
      console.error('Failed to resume browser task:', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsActionPending(true);
      const res = await cancelBrowserTask(taskId, 'Stopped by user');
      setTask(res);
    } catch (err) {
      console.error('Failed to cancel browser task:', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleConfirm = async (approved: boolean) => {
    try {
      setIsActionPending(true);
      const res = await confirmBrowserTaskAction(taskId, approved);
      setTask(res);
    } catch (err) {
      console.error('Failed to respond to confirmation:', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const status = task?.status || 'running';
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status);
  const isPaused = status === 'paused';
  const isAwaitingConfirmation = status === 'awaiting_confirmation';

  const progressPercent = Math.min(
    100,
    Math.round((currentStepIndex / Math.max(totalSteps, 1)) * 100)
  );

  const initialUrl = task?.plan?.steps?.[0]?.action?.url || task?.approved_scope?.allowed_domains?.[0] || 'Browser Session';

  return (
    <>
      <div className={`browser-preview-card ${compact ? 'browser-preview-card--compact' : ''}`}>
        {/* Header */}
        <div className="browser-preview-card__header">
          <div className="browser-preview-card__title-group">
            <svg
              className="browser-preview-card__icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="browser-preview-card__url" title={initialUrl}>
              {initialUrl}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`browser-preview-card__status-pill browser-preview-card__status-pill--${status}`}>
              <span className="browser-preview-card__dot" />
              {status.replace('_', ' ')}
            </span>
            {onClose && (
              <button
                type="button"
                className="browser-preview-card__btn"
                onClick={onClose}
                title="Close preview"
                style={{ padding: '2px 6px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Viewport View / Screenshot */}
        <div
          className="browser-preview-card__viewport"
          onClick={() => screenshotUrl && setIsFullscreen(true)}
          title={screenshotUrl ? 'Click to expand fullscreen preview' : 'Awaiting viewport frame...'}
        >
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt="Live Browser Viewport"
              className="browser-preview-card__screenshot"
            />
          ) : (
            <div className="browser-preview-card__placeholder">
              <div className="browser-preview-card__spinner" />
              <span>Streaming browser viewport...</span>
            </div>
          )}

          {screenshotUrl && (
            <div className="browser-preview-card__viewport-overlay">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <span>Expand</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="browser-preview-card__progress-track">
          <div
            className="browser-preview-card__progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Action Stream / Latest Step */}
        <div className="browser-preview-card__action-stream">
          <span className="browser-preview-card__action-badge">Live</span>
          <span className="browser-preview-card__action-text" title={latestActionText}>
            {latestActionText}
          </span>
        </div>

        {/* Confirmation Gate Banner */}
        {isAwaitingConfirmation && (
          <div className="browser-preview-card__confirmation-banner">
            <div className="browser-preview-card__confirmation-text">
              <strong>Approval Needed:</strong> {task?.pending_confirmation?.reason || 'Consequential action detected'}
            </div>
            <div className="browser-preview-card__btn-group">
              <button
                type="button"
                className="browser-preview-card__btn browser-preview-card__btn--accent"
                disabled={isActionPending}
                onClick={() => handleConfirm(true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="browser-preview-card__btn browser-preview-card__btn--danger"
                disabled={isActionPending}
                onClick={() => handleConfirm(false)}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Controls Toolbar */}
        <div className="browser-preview-card__toolbar">
          <span className="browser-preview-card__step-info">
            Step {currentStepIndex} of {totalSteps} ({progressPercent}%)
          </span>

          <div className="browser-preview-card__btn-group">
            {!isTerminal && (
              <>
                {isPaused ? (
                  <button
                    type="button"
                    className="browser-preview-card__btn browser-preview-card__btn--accent"
                    disabled={isActionPending}
                    onClick={handleResume}
                    title="Resume task execution"
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    className="browser-preview-card__btn"
                    disabled={isActionPending}
                    onClick={handlePause}
                    title="Pause execution (e.g. for manual login or review)"
                  >
                    ⏸ Pause
                  </button>
                )}

                <button
                  type="button"
                  className="browser-preview-card__btn browser-preview-card__btn--danger"
                  disabled={isActionPending}
                  onClick={handleStop}
                  title="Stop browser agent"
                >
                  ⏹ Stop
                </button>
              </>
            )}

            {screenshotUrl && (
              <button
                type="button"
                className="browser-preview-card__btn"
                onClick={() => setIsFullscreen(true)}
                title="View enlarged screenshot"
              >
                ⛶ Fullscreen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      {isFullscreen && screenshotUrl && (
        <div className="browser-preview-modal-backdrop" onClick={() => setIsFullscreen(false)}>
          <div className="browser-preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="browser-preview-card__header">
              <span className="browser-preview-card__url">{initialUrl}</span>
              <button
                type="button"
                className="browser-preview-card__btn"
                onClick={() => setIsFullscreen(false)}
              >
                ✕ Close
              </button>
            </div>
            <div className="browser-preview-modal-image-wrap">
              <img
                src={screenshotUrl}
                alt="Enlarged Viewport"
                className="browser-preview-modal-image"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
