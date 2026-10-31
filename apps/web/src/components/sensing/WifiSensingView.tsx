import React, { useCallback, useEffect, useState } from 'react';
import {
  createSensorConfig,
  fetchSensingAudits,
  fetchSensingCapabilities,
  fetchSensingEvents,
  fetchSensingStatus,
  fetchSensingSummary,
  fetchSensorConfigs,
  purgeSensingEvents,
  resetSensingSimulation,
  startSensingSimulation,
  stepSensingSimulation,
  stopSensingSimulation,
  updateSensorConfig,
} from '../../lib/api';
import type {
  SensingCapabilitiesResponse,
  SensingEvent,
  SensingOccupancySummary,
  SensorConfig,
  WifiSensingAudit,
  WifiSensingStatusResponse,
} from '../../types';
import { RoomPositionCanvas } from './RoomPositionCanvas';
import { Esp32HardwarePanel } from './Esp32HardwarePanel';
import './WifiSensingView.css';

export const WifiSensingView: React.FC = () => {
  // State
  const [statusData, setStatusData] = useState<WifiSensingStatusResponse | null>(null);
  const [capabilities, setCapabilities] = useState<SensingCapabilitiesResponse | null>(null);
  const [configs, setConfigs] = useState<SensorConfig[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [summary, setSummary] = useState<SensingOccupancySummary | null>(null);
  const [events, setEvents] = useState<SensingEvent[]>([]);
  const [audits, setAudits] = useState<WifiSensingAudit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Panels
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState<boolean>(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState<boolean>(false);

  // New room form state
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomAuth, setNewRoomAuth] = useState<boolean>(true);
  const [newRoomSpeed, setNewRoomSpeed] = useState<number>(1.0);
  const [newRoomRetention, setNewRoomRetention] = useState<number>(7);

  // Selected config
  const activeConfig = configs.find((c) => c.room_id === selectedRoomId);

  // Initial load
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [statusRes, capsRes, configsRes] = await Promise.all([
        fetchSensingStatus(),
        fetchSensingCapabilities(),
        fetchSensorConfigs(),
      ]);
      setStatusData(statusRes);
      setCapabilities(capsRes);
      setConfigs(configsRes);

      if (configsRes.length > 0 && !selectedRoomId) {
        setSelectedRoomId(configsRes[0].room_id);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sensing data.');
    } finally {
      setLoading(false);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load room details & events
  const loadRoomData = useCallback(async (roomId: string) => {
    if (!roomId) return;
    try {
      const [sumRes, evtsRes] = await Promise.all([
        fetchSensingSummary(roomId).catch(() => null),
        fetchSensingEvents(roomId, 30),
      ]);
      setSummary(sumRes);
      setEvents(evtsRes.events);
    } catch {
      // Ignored non-critical failure
    }
  }, []);

  useEffect(() => {
    if (selectedRoomId) {
      void loadRoomData(selectedRoomId);
    }
  }, [selectedRoomId, loadRoomData]);

  // Periodic polling if active simulation
  useEffect(() => {
    if (!activeConfig || !activeConfig.is_active) return;

    const interval = setInterval(() => {
      void loadRoomData(activeConfig.room_id);
      void fetchSensingStatus().then(setStatusData).catch(() => null);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeConfig, loadRoomData]);

  // Actions
  const handleStart = async () => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await startSensingSimulation(activeConfig.room_id, activeConfig.simulation_speed);
      await loadInitialData();
      await loadRoomData(activeConfig.room_id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start simulation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await stopSensingSimulation(activeConfig.room_id);
      await loadInitialData();
      await loadRoomData(activeConfig.room_id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to stop simulation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await resetSensingSimulation(activeConfig.room_id);
      await loadInitialData();
      await loadRoomData(activeConfig.room_id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to reset simulation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStep = async () => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await stepSensingSimulation(activeConfig.room_id);
      await loadRoomData(activeConfig.room_id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to step simulation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleConsent = async () => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await updateSensorConfig(activeConfig.id, {
        is_authorized: !activeConfig.is_authorized,
      });
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update consent.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    if (!activeConfig) return;
    try {
      setActionLoading(true);
      const updated = await updateSensorConfig(activeConfig.id, { simulation_speed: speed });
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update speed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurge = async () => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await purgeSensingEvents(selectedRoomId || undefined);
      setShowPurgeConfirm(false);
      if (selectedRoomId) {
        await loadRoomData(selectedRoomId);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to purge events.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomId || !newRoomName) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const created = await createSensorConfig({
        room_id: newRoomId,
        room_name: newRoomName,
        is_authorized: newRoomAuth,
        simulation_speed: newRoomSpeed,
        retention_days: newRoomRetention,
      });
      setShowCreateModal(false);
      setNewRoomId('');
      setNewRoomName('');
      await loadInitialData();
      setSelectedRoomId(created.room_id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create room.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAudits = async () => {
    try {
      const records = await fetchSensingAudits(50);
      setAudits(records);
      setShowAuditDrawer(true);
    } catch {
      // Ignored
    }
  };

  return (
    <div className="sensing-workspace">
      {/* Header */}
      <div className="sensing-header">
        <div className="sensing-title-row">
          <h1 className="sensing-title">Wi-Fi Sensing & Occupancy Monitor</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-sensing" onClick={() => void handleOpenAudits()}>
              Audit Log
            </button>
            <button className="btn-sensing btn-sensing-primary" onClick={() => setShowCreateModal(true)}>
              + Register Zone
            </button>
          </div>
        </div>

        {/* Prominent Simulation Banner */}
        <div className="simulation-banner">
          <span className="simulation-badge">SIMULATION MODE ACTIVE</span>
          <div className="simulation-banner-text">
            <strong>SYNTHETIC SENSOR TELEMETRY ONLY:</strong> This workspace operates exclusively using
            mathematically simulated Channel State Information (CSI). No physical Wi-Fi sensing hardware is
            detected or connected. Observations do not represent real people, biological presence, or physical rooms.
          </div>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* ESP32 Physical Hardware Controller & Spectrum Monitor */}
      <Esp32HardwarePanel />

      {/* Toolbar / Room Controls */}
      <div className="room-toolbar">
        <div className="room-selector-group">
          <label className="room-label" htmlFor="sensing-room-select">Active Zone:</label>
          <select
            id="sensing-room-select"
            className="room-select"
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            disabled={configs.length === 0}
          >
            {configs.length === 0 ? (
              <option value="">No zones configured</option>
            ) : (
              configs.map((c) => (
                <option key={c.id} value={c.room_id}>
                  {c.room_name} ({c.room_id}) {c.is_active ? '[Running]' : '[Stopped]'}
                </option>
              ))
            )}
          </select>

          {activeConfig && (
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: activeConfig.is_active ? 'rgba(34, 197, 94, 0.15)' : '#2b2b2b',
                color: activeConfig.is_active ? '#4ade80' : '#a3a3a3',
                border: activeConfig.is_active ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid #444',
                fontWeight: 600,
              }}
            >
              {activeConfig.is_active ? 'ACTIVE SIMULATION' : 'SIMULATION IDLE'}
            </span>
          )}
        </div>

        {activeConfig && (
          <div className="control-buttons-group">
            <button
              className="btn-sensing"
              onClick={() => void handleToggleConsent()}
              disabled={actionLoading}
              title="Explicit consent is mandatory before starting sensing in any zone."
            >
              Consent: {activeConfig.is_authorized ? 'Authorized' : 'Unauthorized'}
            </button>

            <select
              className="room-select"
              value={activeConfig.simulation_speed}
              onChange={(e) => void handleSpeedChange(parseFloat(e.target.value))}
              disabled={actionLoading}
              title="Simulation speed multiplier"
            >
              <option value={1.0}>1.0x Speed</option>
              <option value={2.0}>2.0x Speed</option>
              <option value={5.0}>5.0x Speed</option>
            </select>

            {activeConfig.is_active ? (
              <button
                className="btn-sensing btn-sensing-danger"
                onClick={() => void handleStop()}
                disabled={actionLoading}
              >
                Stop Simulation
              </button>
            ) : (
              <button
                className="btn-sensing btn-sensing-primary"
                onClick={() => void handleStart()}
                disabled={actionLoading || !activeConfig.is_authorized}
              >
                Start Simulation
              </button>
            )}

            <button
              className="btn-sensing"
              onClick={() => void handleStep()}
              disabled={actionLoading || !activeConfig.is_authorized}
              title="Generate single deterministic observation step"
            >
              Step Tick
            </button>

            <button
              className="btn-sensing"
              onClick={() => void handleReset()}
              disabled={actionLoading}
            >
              Reset
            </button>

            <button
              className="btn-sensing btn-sensing-danger"
              onClick={() => setShowPurgeConfirm(true)}
              disabled={actionLoading}
              title="Purge retained events for this room"
            >
              Purge History
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="sensing-empty-state">
          <span className="sensing-loading-spinner" /> Loading sensor telemetry...
        </div>
      ) : configs.length === 0 ? (
        <div className="sensing-empty-state">
          <p>No sensing zones configured.</p>
          <button className="btn-sensing btn-sensing-primary" onClick={() => setShowCreateModal(true)}>
            Register First Sensing Zone
          </button>
        </div>
      ) : (
        <>
          {/* Primary Interactive 2D Room Position Canvas */}
          {activeConfig && (
            <RoomPositionCanvas
              currentEvent={events.length > 0 ? events[0] : null}
              historicalEvents={events}
              roomName={activeConfig.room_name}
              roomId={activeConfig.room_id}
              isSimulated={activeConfig.is_active ? statusData?.simulation_mode ?? true : true}
              isActive={activeConfig.is_active}
              onStepTick={() => void handleStep()}
            />
          )}

          {/* Collapsible Technical Diagnostics Drawer */}
          <details className="diagnostics-drawer">
            <summary className="diagnostics-summary">
              <span className="diagnostics-summary-title">Technical Diagnostics & Raw RF Telemetry</span>
              <span className="diagnostics-summary-hint">Click to inspect numerical RSSI tables, state breakdowns, and hardware logs</span>
            </summary>

            <div className="diagnostics-content">
              {/* Metrics Row */}
              <div className="metrics-row">
            <div className="metric-tile">
              <div className="metric-tile-title">Simulated Occupancy State</div>
              <div
                className={`metric-tile-value badge-${
                  summary?.current_state || 'unknown'
                }`}
              >
                {summary?.current_state ? summary.current_state.toUpperCase() : 'UNKNOWN'}
              </div>
              <div className="metric-tile-sub">Statistical disturbance tier</div>
            </div>

            <div className="metric-tile">
              <div className="metric-tile-title">Presence Likelihood</div>
              <div className="metric-tile-value">
                {summary?.current_probability !== null && summary?.current_probability !== undefined
                  ? `${Math.round(summary.current_probability * 100)}%`
                  : 'N/A'}
              </div>
              <div className="metric-tile-sub">Synthetic RF model confidence</div>
            </div>

            <div className="metric-tile">
              <div className="metric-tile-title">Average Signal (RSSI)</div>
              <div className="metric-tile-value">
                {summary?.average_signal_dbm !== undefined ? `${summary.average_signal_dbm} dBm` : '-'}
              </div>
              <div className="metric-tile-sub">Simulated carrier power</div>
            </div>

            <div className="metric-tile">
              <div className="metric-tile-title">Total Retained Samples</div>
              <div className="metric-tile-value">{summary?.total_events ?? 0}</div>
              <div className="metric-tile-sub">
                Retention: {activeConfig?.retention_days ?? 7} days
              </div>
            </div>
          </div>

          {/* Grid: Capabilities & Distribution */}
          <div className="sensing-grid">
            <div className="col-6">
              <div className="sensing-card">
                <div className="card-title">
                  <span>Sensor Provider Capabilities</span>
                  <span style={{ fontSize: '11px', color: '#737373' }}>
                    Active: {statusData?.service}
                  </span>
                </div>
                {capabilities?.providers.map((p) => (
                  <div key={p.provider_id} className="capability-item">
                    <div className="capability-header">
                      <span className="capability-name">{p.name}</span>
                      <span
                        className={`capability-pill ${
                          p.is_available ? 'pill-available' : 'pill-unavailable'
                        }`}
                      >
                        {p.is_available ? 'Available (Simulated)' : 'Not Detected'}
                      </span>
                    </div>
                    <div className="capability-detail">
                      {p.is_available ? (
                        <>Measurements: {p.supported_measurements.join(', ')}</>
                      ) : (
                        <>{p.unavailability_reason || 'Hardware not supported on this platform.'}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-6">
              <div className="sensing-card">
                <div className="card-title">Occupancy State Distribution</div>
                {summary && summary.total_events > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(summary.state_breakdown).map(([state, count]) => {
                      const pct = Math.round((count / summary.total_events) * 100);
                      return (
                        <div key={state}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '12px',
                              marginBottom: '4px',
                            }}
                          >
                            <span style={{ textTransform: 'capitalize' }}>{state}</span>
                            <span>
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div
                            style={{
                              height: '6px',
                              backgroundColor: '#1a1a1a',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                backgroundColor:
                                  state === 'motion'
                                    ? '#f59e0b'
                                    : state === 'presence'
                                    ? '#34d399'
                                    : state === 'vacant'
                                    ? '#60a5fa'
                                    : '#9ca3af',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sensing-empty-state">No events recorded for this zone yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Normalized Events Table */}
          <div className="sensing-card">
            <div className="card-title">
              <span>Recent Sensor Observations</span>
              <span style={{ fontSize: '11px', color: '#737373' }}>
                Showing last {events.length} records
              </span>
            </div>

            {events.length === 0 ? (
              <div className="sensing-empty-state">
                No telemetry events logged. Click &quot;Start Simulation&quot; or &quot;Step Tick&quot; to generate synthetic observations.
              </div>
            ) : (
              <div className="events-table-wrapper">
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>Time (UTC)</th>
                      <th>Room</th>
                      <th>Source</th>
                      <th>State</th>
                      <th>Probability</th>
                      <th>Motion</th>
                      <th>RSSI</th>
                      <th>Quality</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </td>
                        <td>{ev.room_id}</td>
                        <td>
                          <span className="sim-tag">SIMULATED</span>
                        </td>
                        <td>
                          <span className={`badge-${ev.presence_state}`}>
                            {ev.presence_state.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {ev.presence_probability !== null && ev.presence_probability !== undefined
                            ? `${Math.round(ev.presence_probability * 100)}%`
                            : 'N/A'}
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{ev.motion_level}</td>
                        <td>{ev.signal_strength_dbm} dBm</td>
                        <td>{Math.round(ev.quality_score * 100)}%</td>
                        <td style={{ color: '#888', fontSize: '11px' }}>
                          {String(ev.raw_metrics?.inference_note || '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </details>
    </>
  )}

      {/* Create Zone Modal */}
      {showCreateModal && (
        <div className="sensing-modal-overlay">
          <div className="sensing-modal">
            <h2 className="sensing-modal-title">Register Sensing Zone</h2>
            <form onSubmit={(e) => void handleCreateRoom(e)}>
              <div className="form-group">
                <label htmlFor="create-zone-id">Room Identifier (e.g. office_east)</label>
                <input
                  id="create-zone-id"
                  className="form-input"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="lowercase, numbers, dashes"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-zone-name">Display Name</label>
                <input
                  id="create-zone-name"
                  className="form-input"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Executive Office East"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={newRoomAuth}
                    onChange={(e) => setNewRoomAuth(e.target.checked)}
                  />
                  <span>Operator Consent Authorized</span>
                </label>
                <div style={{ fontSize: '11px', color: '#737373', marginTop: '4px' }}>
                  Explicit consent is required to activate sensing in this room.
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="create-zone-retention">Retention Limit (Days)</label>
                <input
                  id="create-zone-retention"
                  type="number"
                  min={1}
                  max={365}
                  className="form-input"
                  value={newRoomRetention}
                  onChange={(e) => setNewRoomRetention(parseInt(e.target.value) || 7)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-zone-speed">Simulation Speed Multiplier</label>
                <select
                  id="create-zone-speed"
                  className="form-input"
                  value={newRoomSpeed}
                  onChange={(e) => setNewRoomSpeed(parseFloat(e.target.value))}
                >
                  <option value={1.0}>1.0x Normal</option>
                  <option value={2.0}>2.0x Accelerated</option>
                  <option value={5.0}>5.0x Fast</option>
                </select>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-sensing"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-sensing btn-sensing-primary"
                  disabled={actionLoading}
                >
                  Create Zone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purge Confirm Modal */}
      {showPurgeConfirm && (
        <div className="sensing-modal-overlay">
          <div className="sensing-modal">
            <h2 className="sensing-modal-title">Purge Stored Events?</h2>
            <p style={{ fontSize: '13px', color: '#cccccc', lineHeight: 1.5 }}>
              This will permanently delete all stored sensor observations for room{' '}
              <strong>{selectedRoomId}</strong>. This action cannot be undone.
            </p>
            <div className="form-actions">
              <button
                className="btn-sensing"
                onClick={() => setShowPurgeConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-sensing btn-sensing-danger"
                onClick={() => void handlePurge()}
                disabled={actionLoading}
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Drawer Modal */}
      {showAuditDrawer && (
        <div className="sensing-modal-overlay">
          <div className="sensing-modal" style={{ maxWidth: '640px' }}>
            <h2 className="sensing-modal-title">Consent & Lifecycle Audit Trail</h2>
            <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '16px' }}>
              {audits.length === 0 ? (
                <div className="sensing-empty-state">No audit logs recorded.</div>
              ) : (
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Room</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                          {new Date(a.created_at).toLocaleTimeString()}
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.action}</td>
                        <td>{a.room_id || 'all'}</td>
                        <td style={{ fontSize: '11px', color: '#888' }}>
                          {JSON.stringify(a.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="form-actions">
              <button className="btn-sensing" onClick={() => setShowAuditDrawer(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
