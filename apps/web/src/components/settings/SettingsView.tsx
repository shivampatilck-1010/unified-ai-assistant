import React, { useEffect, useState } from 'react';
import { fetchRetentionStatus, purgeAllUserData, triggerRetentionCleanup } from '../../lib/api';
import type { UnifiedProviderStatusResponse, RetentionStatusResponse, ModelInfo } from '../../types';
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
    </div>
  );
};
