import type { BackendStatus } from '../../types';
import './StatusIndicator.css';

interface StatusIndicatorProps {
  status: BackendStatus;
  version?: string | null;
  error?: string | null;
  onRetry?: () => void;
}

export function StatusIndicator({
  status,
  version,
  error,
  onRetry,
}: StatusIndicatorProps) {
  const labels: Record<BackendStatus, string> = {
    checking: 'Connecting…',
    connected: `Backend connected${version ? ` (v${version})` : ''}`,
    disconnected: 'Backend unavailable',
    error: 'Connection error',
  };

  return (
    <div className={`status-indicator status-indicator--${status}`} role="status" aria-live="polite">
      <span className="status-indicator__dot" aria-hidden="true" />
      <span className="status-indicator__label">{labels[status]}</span>
      {(status === 'disconnected' || status === 'error') && error && (
        <span className="status-indicator__error" title={error}>
          — {error}
        </span>
      )}
      {(status === 'disconnected' || status === 'error') && onRetry && (
        <button className="status-indicator__retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
