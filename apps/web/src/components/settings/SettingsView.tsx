import React, { useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchRetentionStatus,
  getApiBase,
  purgeAllUserData,
  setApiBase,
  triggerRetentionCleanup,
  getCustomApiKey,
  setCustomApiKey,
  validateGeminiApiKey,
} from '../../lib/api';
import type { UnifiedProviderStatusResponse, RetentionStatusResponse, ModelInfo } from '../../types';
import { FollowupEmailModal } from '../chat/FollowupEmailModal';
import './SettingsView.css';

interface SettingsViewProps {
  providerStatus: UnifiedProviderStatusResponse | null;
  onRefreshConversations?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ providerStatus, onRefreshConversations }) => {
  const [retention, setRetention] = useState<RetentionStatusResponse | null>(null);
  const [loadingRetention, setLoadingRetention] = useState<boolean>(true);
  const [cleanupActionLoading, setCleanupActionLoading] = useState<boolean>(false);
  const [purgeActionLoading, setPurgeActionLoading] = useState<boolean>(false);
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Backend Ingress & Endpoint Configuration
  const [backendUrl, setBackendUrl] = useState<string>(getApiBase());
  const [testingBackend, setTestingBackend] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Custom Gemini API Key Configuration
  const [apiKeyInput, setApiKeyInput] = useState<string>(getCustomApiKey() || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);
  const [keyResult, setKeyResult] = useState<{ success: boolean; message: string } | null>(null);

  // Chat Capabilities (Shifted from Chat view)
  const [prefOrchestration, setPrefOrchestration] = useState<boolean>(() => {
    return localStorage.getItem('unified_ai_pref_orchestration') === 'true';
  });
  const [prefResearch, setPrefResearch] = useState<boolean>(() => {
    return localStorage.getItem('unified_ai_pref_research') === 'true';
  });
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);

  const handleToggleOrchestration = (val: boolean) => {
    setPrefOrchestration(val);
    localStorage.setItem('unified_ai_pref_orchestration', String(val));
    window.dispatchEvent(new CustomEvent('chat-prefs-updated'));
    setNotification({
      type: 'success',
      message: `Autonomous Orchestration has been turned ${val ? 'ON' : 'OFF'}.`,
    });
  };

  const handleToggleResearch = (val: boolean) => {
    setPrefResearch(val);
    localStorage.setItem('unified_ai_pref_research', String(val));
    window.dispatchEvent(new CustomEvent('chat-prefs-updated'));
    setNotification({
      type: 'success',
      message: `Live Web Research & Grounding has been turned ${val ? 'ON' : 'OFF'}.`,
    });
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (trimmed) {
      setCustomApiKey(trimmed);
      setNotification({
        type: 'success',
        message: 'Personal Google Gemini API key saved! Chat queries will now connect using your key.',
      });
    } else {
      setCustomApiKey(null);
      setNotification({
        type: 'success',
        message: 'Personal API key cleared. Reverted to default credentials.',
      });
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyResult({ success: false, message: 'Please enter an API key first.' });
      return;
    }
    setTestingKey(true);
    setKeyResult(null);
    try {
      const res = await validateGeminiApiKey(apiKeyInput.trim());
      setKeyResult({
        success: res.valid,
        message: res.valid
          ? `✓ Verified successfully! Available models: ${res.models?.join(', ') || 'gemini-3.5-flash-lite'}`
          : `✗ ${res.message}`,
      });
    } catch (err) {
      setKeyResult({
        success: false,
        message: err instanceof Error ? err.message : 'Validation failed',
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleResetApiKey = () => {
    setApiKeyInput('');
    setCustomApiKey(null);
    setKeyResult(null);
    setNotification({
      type: 'success',
      message: 'Personal API key removed. Reverted to default edge credentials.',
    });
  };

  const handleSaveBackendUrl = () => {
    setApiBase(backendUrl);
    setNotification({
      type: 'success',
      message: `Backend API endpoint updated to: ${backendUrl || 'relative default'}`,
    });
  };

  const handleTestBackend = async () => {
    try {
      setTestingBackend(true);
      setTestResult(null);
      const start = performance.now();
      const res = await fetchHealth();
      const duration = Math.round(performance.now() - start);
      setTestResult({
        success: true,
        message: `Connected successfully (v${res.version || '0.1.0'}) - ${duration}ms latency`,
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTestingBackend(false);
    }
  };

  const handleResetBackend = () => {
    setApiBase(null);
    setBackendUrl(getApiBase());
    setNotification({
      type: 'success',
      message: 'Backend API endpoint reset to default.',
    });
  };

  const loadRetention = async () => {
    try {
      setLoadingRetention(true);
      const res = await fetchRetentionStatus();
      setRetention(res);
    } catch {
      // Non-critical if offline
    } finally {
      setLoadingRetention(false);
    }
  };

  useEffect(() => {
    void loadRetention();
  }, []);

  const handleTriggerCleanup = async () => {
    try {
      setCleanupActionLoading(true);
      setNotification(null);
      const res = await triggerRetentionCleanup();
      setNotification({
        type: 'success',
        message: `Cleanup completed. Purged ${res.results.expired_conversations} conversations, ${res.results.expired_files} files, and ${res.results.expired_sensing_events} sensing events.`,
      });
      await loadRetention();
      if (onRefreshConversations) onRefreshConversations();
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to execute retention cleanup.',
      });
    } finally {
      setCleanupActionLoading(false);
    }
  };

  const handlePurgeAll = async () => {
    try {
      setPurgeActionLoading(true);
      setNotification(null);
      const res = await purgeAllUserData(true);
      setNotification({
        type: 'success',
        message: res.message,
      });
      setShowPurgeModal(false);
      await loadRetention();
      if (onRefreshConversations) onRefreshConversations();
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to purge all user data.',
      });
    } finally {
      setPurgeActionLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="settings-view">
      <div className="settings-view__container">
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">Workspace Settings & Privacy</h2>
          <p className="settings-subtitle">
            Manage data retention lifecycle, AI model configurations, and system preferences.
          </p>
        </div>

        {notification && (
          <div className={`settings-notification settings-notification--${notification.type}`}>
            <span>{notification.message}</span>
            <button
              type="button"
              className="settings-notification__close"
              onClick={() => setNotification(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* Chat Intelligence & Workflow Capabilities (Shifted from Chat view) */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="settings-icon">
                <path d="M10 2L12.5 7.5L18.5 8.5L14 12.8L15 18.5L10 15.5L5 18.5L6 12.8L1.5 8.5L7.5 7.5L10 2Z" stroke="#e2a03f" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <div>
                <h3 className="settings-section__title">Chat Intelligence & Capabilities</h3>
                <span className="privacy-active-badge" style={{ background: '#3b1d5c', color: '#e9d5ff' }}>AI Controls</span>
              </div>
            </div>
            <p className="settings-section__desc">
              Configure autonomous orchestration, live internet research, and automated email recap dispatching.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {/* Orchestration Switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111116', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f3f4f6' }}>Autonomous Orchestration</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Enable multi-step goal planning, dynamic subagent coordination, and automated tool execution.</div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleOrchestration(!prefOrchestration)}
                style={{
                  background: prefOrchestration ? '#7c3aed' : '#262626',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {prefOrchestration ? 'ACTIVE (ON)' : 'DISABLED (OFF)'}
              </button>
            </div>

            {/* Web Research Switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111116', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f3f4f6' }}>Live Web Research & Grounding</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Ground AI responses with live search results, authoritative citations, and fresh web knowledge.</div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleResearch(!prefResearch)}
                style={{
                  background: prefResearch ? '#2563eb' : '#262626',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {prefResearch ? 'ACTIVE (ON)' : 'DISABLED (OFF)'}
              </button>
            </div>

            {/* Follow-up Email Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111116', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f3f4f6' }}>Follow-up Executive Recap Email</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Send conversation takeaways, action items, and structured briefing notes directly to your email inbox.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                style={{
                  background: '#1e3a5f',
                  border: '1px solid #3b82f6',
                  color: '#93c5fd',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontWeight: 500,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span>Dispatch Recap</span>
              </button>
            </div>
          </div>
        </section>

        {/* Backend Ingress & Endpoint Configuration */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="settings-icon">
                <circle cx="10" cy="10" r="7" stroke="#3b82f6" strokeWidth="1.6" />
                <path d="M10 6v4l2.5 2.5" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <div>
                <h3 className="settings-section__title">Backend API Endpoint</h3>
                <span className="privacy-active-badge" style={{ background: '#1e3a5f', color: '#93c5fd' }}>Ingress</span>
              </div>
            </div>
            <p className="settings-section__desc">
              Configure your backend server URL (e.g. Cloudflare Tunnel, staging domain, or local development port).
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000 or https://your-tunnel.trycloudflare.com"
                style={{
                  flex: 1,
                  minWidth: '260px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={handleSaveBackendUrl}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Endpoint
              </button>
              <button
                type="button"
                onClick={handleTestBackend}
                disabled={testingBackend}
                style={{
                  background: '#262626',
                  color: '#e5e5e5',
                  border: '1px solid #3d3d3d',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  cursor: testingBackend ? 'not-allowed' : 'pointer',
                }}
              >
                {testingBackend ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                type="button"
                onClick={handleResetBackend}
                style={{
                  background: 'transparent',
                  color: '#a3a3a3',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            </div>
            {testResult && (
              <div
                style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: testResult.success ? '#064e3b' : '#7f1d1d',
                  color: testResult.success ? '#6ee7b7' : '#fca5a5',
                  border: `1px solid ${testResult.success ? '#059669' : '#b91c1c'}`,
                }}
              >
                {testResult.success ? '✓ ' : '✗ '} {testResult.message}
              </div>
            )}
          </div>
        </section>

        {/* Custom Gemini API Key Configuration */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="settings-icon">
                <path d="M21 2l-2 2m-1-1l-3 3 2 2 3-3-2-2z" />
                <path d="M15 5l4 4-11 11H4v-4l11-11z" />
              </svg>
              <div>
                <h3 className="settings-section__title">Custom Gemini API Key</h3>
                <span
                  className="privacy-active-badge"
                  style={{
                    background: getCustomApiKey() ? '#064e3b' : '#1e3a5f',
                    color: getCustomApiKey() ? '#6ee7b7' : '#93c5fd',
                  }}
                >
                  {getCustomApiKey() ? 'Personal Key Active' : 'Default Gateway Active'}
                </span>
              </div>
            </div>
            <p className="settings-section__desc">
              Connect your personal Google Gemini API key to query models directly with your own quota. Keys are stored locally in your browser. Get a key free at{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38bdf8', textDecoration: 'underline' }}
              >
                Google AI Studio ↗
              </a>
              .
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste your Gemini API key (AIzaSy... or AQ.Ab8...)"
                  style={{
                    width: '100%',
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    padding: '8px 56px 8px 12px',
                    color: '#fff',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#262626',
                    border: '1px solid #3d3d3d',
                    color: '#a3a3a3',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveApiKey}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Key
              </button>

              <button
                type="button"
                onClick={handleTestApiKey}
                disabled={testingKey || !apiKeyInput.trim()}
                style={{
                  background: '#262626',
                  color: '#e5e5e5',
                  border: '1px solid #3d3d3d',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  cursor: testingKey || !apiKeyInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: testingKey || !apiKeyInput.trim() ? 0.6 : 1,
                }}
              >
                {testingKey ? 'Testing…' : 'Test Key'}
              </button>

              <button
                type="button"
                onClick={handleResetApiKey}
                style={{
                  background: 'transparent',
                  color: '#a3a3a3',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>

            {keyResult && (
              <div
                style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: keyResult.success ? '#064e3b' : '#7f1d1d',
                  color: keyResult.success ? '#6ee7b7' : '#fca5a5',
                  border: `1px solid ${keyResult.success ? '#059669' : '#b91c1c'}`,
                }}
              >
                {keyResult.message}
              </div>
            )}
          </div>
        </section>

        {/* 1. Mandatory 72-Hour Data Retention & Privacy Section */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="settings-icon">
                <path
                  d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4v4l3 3"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <h3 className="settings-section__title">72-Hour Data Retention & Privacy Policy</h3>
                <span className="privacy-active-badge">Active Enforcement</span>
              </div>
            </div>
            <p className="settings-section__desc">
              Your stored data is automatically and permanently purged 72 hours after inactivity.
              This includes chat conversations, uploaded documents, extracted embeddings, Wi-Fi sensing logs,
              browser agent tasks, and workflows.
            </p>
          </div>

          <div className="retention-grid">
            <div className="retention-card">
              <div className="retention-card__label">Policy Retention Limit</div>
              <div className="retention-card__value">72 Hours</div>
              <div className="retention-card__sub">Automated rolling cleanup</div>
            </div>

            <div className="retention-card">
              <div className="retention-card__label">Active Conversations</div>
              <div className="retention-card__value">
                {loadingRetention ? '...' : retention?.active_conversations_count ?? 0}
              </div>
              <div className="retention-card__sub">Expires 72h after last message</div>
            </div>

            <div className="retention-card">
              <div className="retention-card__label">Stored Knowledge Files</div>
              <div className="retention-card__value">
                {loadingRetention ? '...' : retention?.active_files_count ?? 0}
              </div>
              <div className="retention-card__sub">
                {loadingRetention ? '...' : formatBytes(retention?.storage_bytes_used ?? 0)} disk space
              </div>
            </div>

            <div className="retention-card">
              <div className="retention-card__label">Wi-Fi Sensing Records</div>
              <div className="retention-card__value">
                {loadingRetention ? '...' : retention?.sensing_events_count ?? 0}
              </div>
              <div className="retention-card__sub">Rolling time-series telemetry</div>
            </div>
          </div>

          {retention?.earliest_data_expiry && (
            <div className="retention-expiry-banner">
              <span className="retention-expiry-icon">ℹ</span>
              <span>
                Earliest scheduled expiration: <strong>{new Date(retention.earliest_data_expiry).toLocaleString()}</strong>
              </span>
            </div>
          )}

          <div className="retention-actions">
            <button
              type="button"
              className="btn-settings-action btn-cleanup"
              disabled={cleanupActionLoading || loadingRetention}
              onClick={() => void handleTriggerCleanup()}
            >
              {cleanupActionLoading ? 'Running Cleanup...' : 'Run Expired Data Cleanup Now'}
            </button>
            <button
              type="button"
              className="btn-settings-action btn-danger"
              disabled={purgeActionLoading || loadingRetention}
              onClick={() => setShowPurgeModal(true)}
            >
              Purge All My Stored Data
            </button>
          </div>
        </section>

        {/* 2. AI Provider & Model Configuration */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="settings-icon">
                <rect x="3" y="3" width="14" height="14" rx="4" stroke="#a855f7" strokeWidth="1.6" />
                <path d="M7 10h6M10 7v6" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <div>
                <h3 className="settings-section__title">AI Provider & Multi-Model Gateway</h3>
                <span className="provider-status-badge">
                  {providerStatus?.configured ? 'Connected & Operational' : 'Not Configured'}
                </span>
              </div>
            </div>
            <p className="settings-section__desc">
              Primary multi-modal reasoning engine, streaming responses, and intelligent agent orchestrator.
            </p>
          </div>

          <div className="provider-config-table">
            <div className="provider-config-row">
              <span className="provider-config-key">Active Provider</span>
              <span className="provider-config-val">
                {providerStatus?.active_provider ? providerStatus.active_provider.toUpperCase() : 'GEMINI'}
              </span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Active Model</span>
              <span className="provider-config-val">
                {providerStatus?.active_model || 'gemini-3.6-flash'}
              </span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Available Configured Models</span>
              <span className="provider-config-val">
                {providerStatus?.available_models && providerStatus.available_models.length > 0
                  ? providerStatus.available_models.map((m: ModelInfo) => m.name).join(', ')
                  : 'Gemini 3.6 Flash, Gemini 3.5 Flash'}
              </span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Rate Limit & Free-Tier Quota Resilience</span>
              <span className="provider-config-val">
                Automatic detection, sanitized human error messaging, and fallback model selection.
              </span>
            </div>
          </div>
        </section>

        {/* 3. System Architecture & Environment */}
        <section className="settings-section">
          <div className="settings-section__header">
            <div className="settings-section__title-group">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="settings-icon">
                <path d="M3 6l7-4 7 4v8l-7 4-7-4V6z" stroke="#34d399" strokeWidth="1.6" />
              </svg>
              <div>
                <h3 className="settings-section__title">System & Security Specifications</h3>
                <span className="system-healthy-badge">Hardened</span>
              </div>
            </div>
            <p className="settings-section__desc">
              Operational parameters, runtime environment, and container boundaries.
            </p>
          </div>

          <div className="provider-config-table">
            <div className="provider-config-row">
              <span className="provider-config-key">Frontend Interface</span>
              <span className="provider-config-val">React 19 + TypeScript + Vite (Dark High-Contrast Theme)</span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Backend Core</span>
              <span className="provider-config-val">Python FastAPI (v0.1.0) + SQLAlchemy + Alembic</span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Wi-Fi Sensing Subsystem</span>
              <span className="provider-config-val">
                2D Interactive Canvas (Synthetic Kinematics + Windows WLAN RSSI Centroid)
              </span>
            </div>
            <div className="provider-config-row">
              <span className="provider-config-key">Database Engine</span>
              <span className="provider-config-val">SQLite (Development/Testing) / PostgreSQL (Production)</span>
            </div>
          </div>
        </section>
      </div>

      {/* Purge All Modal Confirmation */}
      {showPurgeModal && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <h4 className="settings-modal-title">Purge All Stored Data?</h4>
            <p className="settings-modal-warning">
              This action is permanent and cannot be undone. All your chat conversations, messages,
              uploaded documents, vector chunks, and sensing history will be deleted immediately from
              the database and physical disk storage.
            </p>
            <div className="settings-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowPurgeModal(false)}
                disabled={purgeActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={() => void handlePurgeAll()}
                disabled={purgeActionLoading}
              >
                {purgeActionLoading ? 'Purging Everything...' : 'Yes, Permanently Purge Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Email Modal */}
      <FollowupEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        conversationId={null}
      />
    </div>
  );
};
