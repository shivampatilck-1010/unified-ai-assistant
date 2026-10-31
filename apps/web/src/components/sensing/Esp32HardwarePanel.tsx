import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Esp32HardwareStatus } from '../../types';
import {
  calibrateEsp32,
  clearEsp32Calibration,
  connectEsp32,
  disconnectEsp32,
  fetchEsp32Status,
  getApiBase,
} from '../../lib/api';

interface Esp32HardwarePanelProps {
  onStatusUpdate?: (status: Esp32HardwareStatus) => void;
}

export const Esp32HardwarePanel: React.FC<Esp32HardwarePanelProps> = ({ onStatusUpdate }) => {
  const [status, setStatus] = useState<Esp32HardwareStatus | null>(null);
  const [selectedPort, setSelectedPort] = useState<string>('COM7');
  const [selectedBaud, setSelectedBaud] = useState<number>(921600);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showIdfHelp, setShowIdfHelp] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Poll status periodically when not streaming
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetchEsp32Status();
      setStatus(res);
      if (onStatusUpdate) onStatusUpdate(res);
      if (res.port) setSelectedPort(res.port);
      if (res.baud_rate) setSelectedBaud(res.baud_rate);
    } catch {
      // Non-critical poll failure
    }
  }, [onStatusUpdate]);

  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Connect SSE stream for live 20Hz CSI telemetry
  useEffect(() => {
    if (status?.is_connected) {
      const apiBase = getApiBase();
      const sseUrl = `${apiBase}/api/sensing/esp32/stream`;
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.addEventListener('csi_frame', (event) => {
        try {
          const frame = JSON.parse(event.data);
          setStatus((prev) => {
            if (!prev) return prev;
            const updated: Esp32HardwareStatus = {
              ...prev,
              is_connected: true,
              is_streaming: true,
              status: 'receiving_csi',
              status_message: `Receiving live CSI packets from ${frame.mac_address || 'device'} (${frame.rssi_dbm} dBm)`,
              packets_captured: frame.packets_captured ?? prev.packets_captured + 1,
              subcarrier_amplitudes: frame.subcarrier_amplitudes,
              rssi_dbm: frame.rssi_dbm,
              motion_intensity: frame.motion_intensity,
              presence_probability: frame.presence_probability,
              current_state: frame.presence_state,
              calibration_status: frame.calibration_status,
              last_packet_time: frame.timestamp,
              estimated_x: frame.estimated_x,
              estimated_y: frame.estimated_y,
              velocity_mps: frame.velocity_mps,
              occupant_count: frame.occupant_count,
              occupants: frame.occupants,
            };
            if (onStatusUpdate) onStatusUpdate(updated);
            return updated;
          });
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('heartbeat', (event) => {
        try {
          const hb = JSON.parse(event.data);
          setStatus((prev) => {
            if (!prev) return prev;
            const updated: Esp32HardwareStatus = {
              ...prev,
              status: hb.status,
              status_message: hb.status_message,
              packets_per_second: hb.packets_per_second,
              packets_captured: hb.packets_captured,
              current_state: hb.current_state,
              rssi_dbm: hb.rssi_dbm,
              subcarrier_amplitudes: hb.subcarrier_amplitudes?.length
                ? hb.subcarrier_amplitudes
                : prev.subcarrier_amplitudes,
              calibration_status: hb.calibration_status,
            };
            if (onStatusUpdate) onStatusUpdate(updated);
            return updated;
          });
        } catch {
          // ignore parse errors
        }
      });

      es.onerror = () => {
        es.close();
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
      };
    }
  }, [status?.is_connected, onStatusUpdate]);

  // Render 64-subcarrier spectrum canvas
  useEffect(() => {
    if (isCollapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const amps = status?.subcarrier_amplitudes || [];
    if (amps.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      let msg = 'ESP32 CSI Receiver Disconnected — Click Connect to view spectrum';
      if (status?.is_connected) {
        if (status?.wifi_status === 'no_ap_found') {
          msg = `Connected to ${status.port} — Waiting for Wi-Fi Hotspot: SHIVAM_1010 7313 (Error 201)`;
        } else {
          msg = `Listening for CSI packets on ${status.port || 'COM7'}...`;
        }
      }
      ctx.fillText(msg, width / 2, height / 2);
      return;
    }

    const barWidth = Math.max(2, (width - 10) / amps.length);
    const maxAmp = Math.max(30, ...amps);

    amps.forEach((amp, idx) => {
      const barHeight = (amp / maxAmp) * (height - 18);
      const x = 5 + idx * barWidth;
      const y = height - barHeight - 4;

      // Color gradient based on amplitude perturbation
      const grad = ctx.createLinearGradient(0, height, 0, y);
      if (status?.presence_state === 'movement_detected') {
        grad.addColorStop(0, '#059669');
        grad.addColorStop(1, '#34d399');
      } else {
        grad.addColorStop(0, '#2563eb');
        grad.addColorStop(1, '#60a5fa');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Subcarrier index markers
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Subcarrier -32', 40, height - 2);
    ctx.fillText('DC (0)', width / 2, height - 2);
    ctx.fillText('Subcarrier +31', width - 45, height - 2);
  }, [status, isCollapsed]);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setActionMsg(null);
      const res = await connectEsp32(selectedPort, selectedBaud);
      setStatus(res);
      setActionMsg(`Connected to ${res.port} at ${res.baud_rate} baud`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      setActionMsg(null);
      const res = await disconnectEsp32();
      setStatus(res);
      setActionMsg('Port released successfully');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCalibrate = async () => {
    try {
      setLoading(true);
      setActionMsg('Starting 5-second empty room noise floor calibration...');
      const res = await calibrateEsp32(5);
      setStatus(res);
      setActionMsg('Baseline calibration completed successfully');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Calibration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCalibration = async () => {
    try {
      setLoading(true);
      const res = await clearEsp32Calibration();
      setStatus(res);
      setActionMsg('Baseline calibration reset');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status?.is_connected ?? false;
  const isPortBusy = status?.status === 'port_busy';
  const isActuallyStreaming = isConnected && (status?.is_streaming ?? false) && (status?.packets_captured ?? 0) > 0;
  const isWifiMissing = status?.wifi_status === 'no_ap_found' || (status?.last_firmware_log || '').includes('201');

  const getDisplayState = (): { label: string; color: string } => {
    if (!isConnected) return { label: 'DISCONNECTED', color: '#94a3b8' };
    if (isPortBusy) return { label: 'PORT BUSY', color: '#f59e0b' };
    if (isWifiMissing) return { label: 'AP NOT FOUND (SSID: SHIVAM_1010 7313)', color: '#f59e0b' };
    if (status?.wifi_status === 'connecting') return { label: 'CONNECTING TO WI-FI', color: '#38bdf8' };
    if (isActuallyStreaming) {
      const raw = (status?.presence_state || status?.current_state || 'RECEIVING CSI').toUpperCase().replace(/_/g, ' ');
      return { label: raw, color: raw.includes('MOVEMENT') ? '#34d399' : '#38bdf8' };
    }
    if (status?.status === 'waiting_for_packets') return { label: 'AWAITING CSI FRAMES', color: '#38bdf8' };
    return { label: (status?.status || 'CONNECTED').toUpperCase().replace(/_/g, ' '), color: '#60a5fa' };
  };

  const { label: displayState, color: displayColor } = getDisplayState();
  const isCalibrated = status?.is_calibrated || status?.calibration_status === 'calibrated';

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isActuallyStreaming
                ? '#10b981'
                : isConnected
                ? '#38bdf8'
                : isPortBusy || isWifiMissing
                ? '#f59e0b'
                : '#ef4444',
              boxShadow: isActuallyStreaming
                ? '0 0 8px #10b981'
                : isConnected
                ? '0 0 6px #38bdf8'
                : 'none',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                ESP32 DevKit V1 Hardware CSI Receiver
              </h3>
              {isActuallyStreaming ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                  }}
                >
                  ● LIVE CSI STREAMING
                </span>
              ) : isConnected && isWifiMissing ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                  }}
                >
                  ⚠️ AP NOT FOUND (SSID: SHIVAM_1010 7313)
                </span>
              ) : isConnected ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                  }}
                >
                  ○ PORT OPEN (AWAITING CSI PACKETS)
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    color: '#94a3b8',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                  }}
                >
                  ○ DISCONNECTED
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {status?.device_description || 'USB-Enhanced-SERIAL CH9102 (COM7)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            style={{
              fontSize: '11px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            {isCollapsed ? '▼ Expand Spectrum' : '▲ Collapse'}
          </button>

          <button
            onClick={() => setShowIdfHelp((prev) => !prev)}
            style={{
              fontSize: '11px',
              backgroundColor: 'transparent',
              color: '#38bdf8',
              border: '1px solid #0284c7',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            {showIdfHelp ? 'Hide ESP-IDF Help' : 'ESP-IDF Help'}
          </button>

          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={loading}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 12px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Connecting...' : 'Connect ESP32 (COM7)'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 12px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Disconnect Port
            </button>
          )}
        </div>
      </div>

      {/* Port contention warning */}
      {isPortBusy && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginTop: '10px',
            fontSize: '12px',
            color: '#fbbf24',
          }}
        >
          <strong>⚠️ Port Contention Detected on {status?.port}:</strong>
          <div style={{ marginTop: '4px' }}>{status?.status_message}</div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#fde68a' }}>
            Tip: If <code>idf.py monitor</code> is running in another terminal, press{' '}
            <kbd style={{ backgroundColor: '#292524', padding: '1px 4px', borderRadius: '3px' }}>Ctrl + ]</kbd> to
            release the port, then click Connect above.
          </div>
        </div>
      )}

      {/* Wi-Fi AP Missing Alert */}
      {isConnected && isWifiMissing && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginTop: '10px',
            fontSize: '12px',
            color: '#fbbf24',
          }}
        >
          <div style={{ fontWeight: 700, color: '#fef08a', marginBottom: '4px' }}>
            ⚠️ ESP32 Wi-Fi Connection Pending (Hotspot Required):
          </div>
          <div>
            The ESP32 firmware <code>csi_recv_router</code> is connected to COM7, but Wi-Fi AP is not reachable
            (Status: <strong>Error 201: WIFI_REASON_NO_AP_FOUND</strong>).
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#fde68a' }}>
            Please turn ON your Mobile Hotspot or Wi-Fi router with SSID: <strong>SHIVAM_1010 7313</strong> (Password: <code>1234567890</code>).
            As soon as the board connects, it will start sending ping packets to the router and live CSI frames will immediately begin streaming into the spectrum and 3D room below!
          </div>
        </div>
      )}

      {/* ESP-IDF switching instruction drawer */}
      {showIdfHelp && (
        <div
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '10px 14px',
            marginTop: '10px',
            fontSize: '12px',
            color: '#cbd5e1',
            lineHeight: '1.5',
          }}
        >
          <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
            Port Switching with ESP-IDF Monitor:
          </div>
          <div>
            1. <strong>To switch to Unified AI:</strong> Press <kbd>Ctrl + ]</kbd> in your terminal to exit monitor,
            then click <strong>Connect ESP32</strong>.
          </div>
          <div style={{ marginTop: '4px' }}>
            2. <strong>To switch back to idf.py monitor:</strong> Click <strong>Disconnect Port</strong>, then run{' '}
            <code>idf.py -p COM7 -b 921600 monitor</code> in your terminal.
          </div>
        </div>
      )}

      {/* Collapsed Compact Bar */}
      {isCollapsed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid #1e293b',
            fontSize: '12px',
            color: '#94a3b8',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            State:{' '}
            <strong style={{ color: displayColor }}>
              {displayState}
            </strong>
          </div>
          <div>Rate: <strong style={{ color: '#f8fafc' }}>{isConnected && isActuallyStreaming ? `${(status?.packets_per_second ?? 0).toFixed(1)} pkts/s` : '0.0 pkts/s'}</strong></div>
          <div>Total Packets: <strong style={{ color: '#f8fafc' }}>{isConnected ? (status?.packets_captured ?? 0).toLocaleString() : '0'}</strong></div>
          <div>Calibration: <strong style={{ color: isCalibrated ? '#34d399' : '#a78bfa' }}>{isCalibrated ? 'CALIBRATED' : 'UNCALIBRATED'}</strong></div>
        </div>
      ) : (
        <>
          {/* Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
              marginTop: '12px',
              marginBottom: '10px',
            }}
          >
            <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>State</div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  marginTop: '2px',
                  color: displayColor,
                }}
              >
                {displayState}
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Packet Rate</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                {isConnected && isActuallyStreaming && status?.packets_per_second ? `${status.packets_per_second.toFixed(1)} pkts/s` : '0.0 pkts/s'}
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Total Packets</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                {isConnected ? (status?.packets_captured ?? 0).toLocaleString() : '0'}
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Calibration</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: isCalibrated ? '#34d399' : '#a78bfa', marginTop: '2px' }}>
                {isCalibrated ? 'CALIBRATED' : 'UNCALIBRATED'}
              </div>
            </div>
          </div>

          {/* 64-Subcarrier CSI Amplitude Spectrum Canvas */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                Live 64-Subcarrier OFDM Amplitude Spectrum (802.11 CSI)
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                Fresnel Zone Perturbation: {(status?.motion_intensity ?? 0).toFixed(2)}
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={640}
              height={90}
              style={{
                width: '100%',
                height: '90px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
                display: 'block',
              }}
            />
          </div>

          {/* Calibration Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
              paddingTop: '6px',
              borderTop: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleCalibrate}
                disabled={!isConnected || loading}
                style={{
                  fontSize: '11px',
                  backgroundColor: '#4338ca',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                }}
              >
                Calibrate Room Noise Floor (5s)
              </button>
              <button
                onClick={handleClearCalibration}
                disabled={!isConnected || loading}
                style={{
                  fontSize: '11px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                }}
              >
                Reset Calibration
              </button>
            </div>

            {actionMsg && (
              <span style={{ fontSize: '11px', color: '#38bdf8' }}>{actionMsg}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
