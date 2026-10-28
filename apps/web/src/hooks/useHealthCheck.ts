import { useState, useEffect, useRef, useCallback } from 'react';
import type { BackendStatus, HealthResponse } from '../types';
import { fetchHealth } from '../lib/api';

const POLL_INTERVAL = 30_000; // 30 seconds
const TIMEOUT = 8_000;       // 8 second timeout

export function useHealthCheck() {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recheck = useCallback(() => {
    setTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      try {
        const data = await fetchHealth(controller.signal);
        if (!active) return;
        if (data.status === 'ok') {
          setStatus('connected');
          setHealth(data);
          setError(null);
        } else {
          setStatus('error');
          setError(`Unexpected status: ${data.status}`);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('disconnected');
          setError('Health check timed out');
        } else {
          setStatus('disconnected');
          setError(err instanceof Error ? err.message : 'Connection failed');
        }
        setHealth(null);
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkHealth();
    intervalRef.current = setInterval(checkHealth, POLL_INTERVAL);

    return () => {
      active = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [trigger]);

  return { status, health, error, recheck };
}
