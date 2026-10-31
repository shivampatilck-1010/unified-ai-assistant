import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SensingEvent } from '../../types';
import { recordRoomBaseline, saveRoomCalibration } from '../../lib/api';
import { ThreeRoomView } from './ThreeRoomView';
import './RoomPositionCanvas.css';

interface RoomPositionCanvasProps {
  currentEvent: SensingEvent | null;
  historicalEvents: SensingEvent[];
  roomName: string;
  roomId?: string;
  isSimulated: boolean;
  isActive: boolean;
  onStepTick?: () => void;
}

interface RoomDimensions {
  widthM: number;
  lengthM: number;
}

export const RoomPositionCanvas: React.FC<RoomPositionCanvasProps> = ({
  currentEvent,
  historicalEvents,
  roomName,
  roomId,
  isSimulated,
  isActive,
  onStepTick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Display toggles
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');

  // Room geometry (meters)
  const [roomDims, setRoomDims] = useState<RoomDimensions>({ widthM: 6.0, lengthM: 4.0 });
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [calibWidth, setCalibWidth] = useState<number>(6.0);
  const [calibLength, setCalibLength] = useState<number>(4.0);
  const [isCalibratingBaseline, setIsCalibratingBaseline] = useState<boolean>(false);
  const [baselineStatus, setBaselineStatus] = useState<string | null>(null);

  // Playback / Timeline scrub state
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);

  // Chronological events (oldest to newest)
  const chronologicalEvents = React.useMemo(() => {
    return [...historicalEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [historicalEvents]);

  // The active event being displayed (either scrubbed or live)
  const activeDisplayEvent = React.useMemo(() => {
    if (scrubIndex !== null && chronologicalEvents.length > 0) {
      const idx = Math.min(Math.max(0, scrubIndex), chronologicalEvents.length - 1);
      return chronologicalEvents[idx];
    }
    return currentEvent || (chronologicalEvents.length > 0 ? chronologicalEvents[chronologicalEvents.length - 1] : null);
  }, [scrubIndex, chronologicalEvents, currentEvent]);

  // Extract coordinates
  const getCoordinates = (evt: SensingEvent | null): { x: number; y: number; uncertainty: number; vel: number } | null => {
    if (!evt) return null;
    const raw = evt.raw_metrics || {};
    const x = evt.estimated_x ?? (typeof raw.position_x === 'number' ? raw.position_x : null);
    const y = evt.estimated_y ?? (typeof raw.position_y === 'number' ? raw.position_y : null);
    if (x === null || y === null || isNaN(x) || isNaN(y)) return null;

    const uncertainty = evt.uncertainty_radius_m ?? (typeof raw.uncertainty_radius_m === 'number' ? raw.uncertainty_radius_m : 0.4);
    const vel = evt.velocity_mps ?? (typeof raw.velocity_mps === 'number' ? raw.velocity_mps : 0.0);
    return { x, y, uncertainty, vel };
  };

  // Replay interval
  useEffect(() => {
    if (!isPlayingReplay || chronologicalEvents.length === 0) return;

    const interval = setInterval(() => {
      setScrubIndex((prev) => {
        const next = (prev === null ? 0 : prev + 1);
        if (next >= chronologicalEvents.length) {
          setIsPlayingReplay(false);
          return null; // Return to live
        }
        return next;
      });
    }, 1000 / replaySpeed);

    return () => clearInterval(interval);
  }, [isPlayingReplay, chronologicalEvents.length, replaySpeed]);

  // Render Canvas
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Coordinate system setup
    const margin = 36;
    const plotWidth = width - margin * 2;
    const plotHeight = height - margin * 2;

    const scaleX = plotWidth / roomDims.widthM;
    const scaleY = plotHeight / roomDims.lengthM;
    const scale = Math.min(scaleX, scaleY);

    const roomPixelW = roomDims.widthM * scale;
    const roomPixelH = roomDims.lengthM * scale;
    const offsetX = margin + (plotWidth - roomPixelW) / 2;
    const offsetY = margin + (plotHeight - roomPixelH) / 2;

    const toPxX = (xM: number) => offsetX + xM * scale;
    const toPxY = (yM: number) => offsetY + yM * scale;

    // 1. Background floor
    ctx.fillStyle = '#0f172a'; // Deep slate
    ctx.fillRect(offsetX, offsetY, roomPixelW, roomPixelH);

    // 2. Heatmap layer
    if (showHeatmap && chronologicalEvents.length > 0) {
      ctx.save();
      chronologicalEvents.forEach((evt) => {
        const coords = getCoordinates(evt);
        if (coords) {
          const px = toPxX(coords.x);
          const py = toPxY(coords.y);
          const radius = Math.max(16, coords.uncertainty * scale * 1.5);

          const grad = ctx.createRadialGradient(px, py, 2, px, py, radius);
          if (isSimulated) {
            grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)'); // Cyan
            grad.addColorStop(0.5, 'rgba(14, 165, 233, 0.12)');
            grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
          } else {
            grad.addColorStop(0, 'rgba(52, 211, 153, 0.25)'); // Emerald
            grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.12)');
            grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
          }
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // 3. Grid overlay
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;

      // 1-meter vertical grid lines
      for (let m = 0; m <= roomDims.widthM; m += 1.0) {
        const gx = toPxX(m);
        ctx.beginPath();
        ctx.moveTo(gx, offsetY);
        ctx.lineTo(gx, offsetY + roomPixelH);
        ctx.stroke();

        // Meter labels
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${m}m`, gx, offsetY + roomPixelH + 16);
      }

      // 1-meter horizontal grid lines
      for (let m = 0; m <= roomDims.lengthM; m += 1.0) {
        const gy = toPxY(m);
        ctx.beginPath();
        ctx.moveTo(offsetX, gy);
        ctx.lineTo(offsetX + roomPixelW, gy);
        ctx.stroke();

        // Meter labels
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${m}m`, offsetX - 8, gy + 3);
      }
      ctx.restore();
    }

    // 4. Architectural Zones / Furniture
    if (showZones) {
      ctx.save();

      // Workstation / Desk
      const deskX = toPxX(4.0);
      const deskY = toPxY(2.2);
      const deskW = 1.3 * scale;
      const deskH = 0.9 * scale;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(deskX, deskY, deskW, deskH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Workstation', deskX + deskW / 2, deskY + deskH / 2 + 3);

      // Lounge Seating
      const loungeX = toPxX(1.1);
      const loungeY = toPxY(2.5);
      const loungeW = 1.4 * scale;
      const loungeH = 1.1 * scale;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.beginPath();
      ctx.roundRect(loungeX, loungeY, loungeW, loungeH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Lounge', loungeX + loungeW / 2, loungeY + loungeH / 2 + 3);

      // Meeting Zone (dashed oval)
      ctx.beginPath();
      ctx.ellipse(toPxX(2.8), toPxY(1.5), 0.7 * scale, 0.5 * scale, 0, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('Meeting Area', toPxX(2.8), toPxY(1.5) + 3);

      ctx.restore();
    }

    // 5. Perimeter Walls & Door
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;

    // North wall with door opening at x=0.8 to x=1.6
    const doorStartX = toPxX(0.8);
    const doorEndX = toPxX(1.6);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    ctx.lineTo(doorStartX, offsetY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(doorEndX, offsetY);
    ctx.lineTo(offsetX + roomPixelW, offsetY);
    ctx.stroke();

    // Door swing arc
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(doorStartX, offsetY, 0.8 * scale, 0, Math.PI / 2, false);
    ctx.stroke();
    ctx.setLineDash([]);

    // East wall
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(offsetX + roomPixelW, offsetY);
    ctx.lineTo(offsetX + roomPixelW, offsetY + roomPixelH);
    ctx.stroke();

    // South wall
    ctx.beginPath();
    ctx.moveTo(offsetX + roomPixelW, offsetY + roomPixelH);
    ctx.lineTo(offsetX, offsetY + roomPixelH);
    ctx.stroke();

    // West wall
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + roomPixelH);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();

    ctx.restore();

    // 6. Sensor Anchor (Wi-Fi Access Point / Host NIC)
    const anchorPxX = toPxX(3.0);
    const anchorPxY = toPxY(0.15);
    ctx.save();
    ctx.fillStyle = '#f59e0b'; // Amber anchor
    ctx.beginPath();
    ctx.arc(anchorPxX, anchorPxY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Antenna wave rings
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1.5;
    const animPulse = (Date.now() / 400) % 3;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(anchorPxX, anchorPxY, (8 + r * 6 + animPulse * 2), 0.1 * Math.PI, 0.9 * Math.PI, false);
      ctx.stroke();
    }
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isSimulated ? 'Wi-Fi AP Anchor' : 'Host Wi-Fi NIC', anchorPxX, anchorPxY + 22);
    ctx.restore();

    // 7. Movement History Trail
    if (showTrail && chronologicalEvents.length > 1) {
      ctx.save();
      const trailLimit = 40;
      const recent = chronologicalEvents.slice(-trailLimit);

      ctx.beginPath();
      let started = false;
      recent.forEach((evt) => {
        const c = getCoordinates(evt);
        if (c) {
          const px = toPxX(c.x);
          const py = toPxY(c.y);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
      });

      const grad = ctx.createLinearGradient(offsetX, offsetY, offsetX + roomPixelW, offsetY + roomPixelH);
      if (isSimulated) {
        grad.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.8)');
      } else {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
        grad.addColorStop(1, 'rgba(52, 211, 153, 0.8)');
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 8. Fresnel Zone Spatial Uncertainty Ellipsoid (for Single-Link physics)
    const fresnelData = activeDisplayEvent?.fresnel_region || (activeDisplayEvent?.raw_metrics?.fresnel_zone as any);
    if (fresnelData && typeof fresnelData === 'object') {
      const centerPos = fresnelData.center_pos || [3.0, 2.0];
      const semiMajorM = fresnelData.semi_major_axis_m || 1.8;
      const semiMinorM = fresnelData.semi_minor_axis_m || 0.65;
      const angleRad = fresnelData.angle_rad || 0.0;

      const cPxX = toPxX(centerPos[0]);
      const cPxY = toPxY(centerPos[1]);
      const semiMajorPx = semiMajorM * scale;
      const semiMinorPx = semiMinorM * scale;

      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.07)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(cPxX, cPxY, semiMajorPx, semiMinorPx, angleRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.75)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('1st Fresnel Zone (Single-Link Uncertainty)', cPxX, cPxY - semiMinorPx - 4);
      ctx.restore();
    }

    // 9. Live Subject Markers (Multi-Occupancy Human Silhouettes with Directional Vectors)
    interface MultiSubject {
      subject_id: string;
      x: number;
      y: number;
      presence_state?: string;
      velocity_mps?: number;
      uncertainty_radius_m?: number;
    }

    const rawMetrics = (activeDisplayEvent?.raw_metrics || {}) as Record<string, unknown>;
    const multiSubjects = (rawMetrics.tracked_subjects as MultiSubject[] | undefined) || [];
    const currentCoords = getCoordinates(activeDisplayEvent);

    const subjectsToRender: MultiSubject[] = multiSubjects.length > 0
      ? multiSubjects
      : (currentCoords ? [{
          subject_id: activeDisplayEvent?.subject_id || 'Subject #1',
          x: currentCoords.x,
          y: currentCoords.y,
          presence_state: activeDisplayEvent?.presence_state,
          velocity_mps: currentCoords.vel,
          uncertainty_radius_m: currentCoords.uncertainty,
        }] : []);

    const SUBJECT_PALETTE = [
      { fill: '#38bdf8', stroke: '#0284c7', themeRgba: 'rgba(14, 165, 233,' }, // Blue (Subject #1 - You)
      { fill: '#f59e0b', stroke: '#d97706', themeRgba: 'rgba(245, 158, 11,' }, // Amber (Subject #2)
      { fill: '#a855f7', stroke: '#7c3aed', themeRgba: 'rgba(168, 85, 247,' }, // Purple (Subject #3)
      { fill: '#10b981', stroke: '#059669', themeRgba: 'rgba(16, 185, 129,' }, // Emerald (Subject #4)
    ];

    if (subjectsToRender.length > 0) {
      subjectsToRender.forEach((sub, subIdx) => {
        const x = sub.x;
        const y = sub.y;
        const uncertainty = sub.uncertainty_radius_m ?? 0.35;
        const vel = sub.velocity_mps ?? 0.0;
        const px = toPxX(x);
        const py = toPxY(y);
        const radiusPx = uncertainty * scale;
        const pal = SUBJECT_PALETTE[subIdx % SUBJECT_PALETTE.length];

        ctx.save();

        // Translucent uncertainty circle
        ctx.fillStyle = `${pal.themeRgba} 0.15)`;
        ctx.strokeStyle = `${pal.themeRgba} 0.55)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Outer radar pulse wave
        const pulseTime = ((Date.now() + subIdx * 250) / 600) % 2;
        ctx.strokeStyle = `${pal.themeRgba} ${Math.max(0, 0.7 - pulseTime * 0.35)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 8 + pulseTime * 14, 0, Math.PI * 2);
        ctx.stroke();

        // Draw oriented human silhouette (Head + Shoulders/Torso)
        ctx.fillStyle = pal.fill;
        ctx.shadowColor = pal.stroke;
        ctx.shadowBlur = 8;

        // Head
        ctx.beginPath();
        ctx.arc(px, py - 5, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Shoulders & torso arc
        ctx.beginPath();
        ctx.arc(px, py + 3, 7.5, Math.PI, 0, false);
        ctx.lineTo(px + 7.5, py + 9);
        ctx.lineTo(px - 7.5, py + 9);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Heading vector arrow if in motion
        if (vel > 0.1) {
          const angle = (subIdx * 1.2) + (Date.now() / 1500);
          const arrowLen = 22;
          const tipX = px + Math.cos(angle) * arrowLen;
          const tipY = py + Math.sin(angle) * arrowLen;

          ctx.strokeStyle = pal.fill;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - 7 * Math.cos(angle - Math.PI / 6), tipY - 7 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tipX - 7 * Math.cos(angle + Math.PI / 6), tipY - 7 * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = pal.fill;
          ctx.fill();
        }

        // Subject label card (Anonymous Tracking ID + Kinematics)
        const subjectTag = sub.subject_id;
        const stateLabel = (sub.presence_state || 'PRESENCE').toUpperCase();
        const kinLabel =
          sub.presence_state === 'motion'
            ? `Motion (${vel > 0 ? vel.toFixed(1) : '0.8'} m/s)`
            : sub.presence_state === 'presence'
            ? 'Stationary (Breathing)'
            : stateLabel;
        const labelText = `${subjectTag}: ${kinLabel}`;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1.2;
        const textW = ctx.measureText(labelText).width + 16;
        ctx.beginPath();
        ctx.roundRect(px - textW / 2, py - 36, textW, 20, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, px, py - 22);

        ctx.restore();
      });

      // Multi-Occupant Counter Badge
      if (subjectsToRender.length > 1) {
        ctx.save();
        const countBadgeText = `👥 Multi-Person RF Sensing: ${subjectsToRender.length} Occupants Tracked`;
        ctx.font = 'bold 12px sans-serif';
        const badgeW = ctx.measureText(countBadgeText).width + 24;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(offsetX + 14, offsetY + 14, badgeW, 28, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(countBadgeText, offsetX + 26, offsetY + 32);
        ctx.restore();
      }
    } else {
      // Vacant or No Coordinates detected
      ctx.save();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      const vacantText =
        activeDisplayEvent?.presence_state === 'vacant'
          ? 'Zone Vacant (Ambient RF Baseline)'
          : 'Zone Inactive / No Position Detected';
      ctx.fillText(vacantText, offsetX + roomPixelW / 2, offsetY + roomPixelH / 2);
      ctx.restore();
    }

    ctx.restore();
  }, [
    roomDims,
    showGrid,
    showTrail,
    showHeatmap,
    showZones,
    chronologicalEvents,
    activeDisplayEvent,
    isSimulated,
  ]);

  // Animation frame loop
  useEffect(() => {
    let animId: number;
    const render = () => {
      drawScene();
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [drawScene]);

  // Calibration submit
  const handleSaveCalibration = async () => {
    const width = Math.max(2.0, Math.min(20.0, calibWidth));
    const length = Math.max(2.0, Math.min(20.0, calibLength));
    setRoomDims({
      widthM: width,
      lengthM: length,
    });
    if (roomId) {
      try {
        await saveRoomCalibration(roomId, {
          room_width_m: width,
          room_length_m: length,
          anchors: [
            { id: 'ap_01', role: 'transmitter', x_m: width / 2, y_m: 0.2, label: 'Wi-Fi AP Anchor' },
            { id: 'rx_01', role: 'receiver', x_m: width / 2, y_m: length - 0.2, label: 'CSI Receiver Node' },
          ],
          obstacles: [
            { id: 'desk_1', type: 'desk', x_m: width * 0.65, y_m: length * 0.55, width_m: 1.4, length_m: 0.9, label: 'Workstation' },
            { id: 'lounge_1', type: 'sofa', x_m: width * 0.2, y_m: length * 0.6, width_m: 1.4, length_m: 1.1, label: 'Lounge' },
          ],
          is_hardware_calibrated: !isSimulated,
          calibrated_at: new Date().toISOString(),
        });
      } catch {
        // Fallback to local memory calibration
      }
    }
    setShowCalibrationModal(false);
  };

  return (
    <div className={`room-position-card ${isFullscreen ? 'room-position-card--fullscreen' : ''}`}>
      {/* Header bar with Mode Badge */}
      <div className="room-position-header">
        <div className="room-title-area">
          <h3 className="room-name">{roomName} — Real-Time Spatial Positioning</h3>
          <div className="mode-badge-container">
            {activeDisplayEvent?.raw_metrics?.engine === 'wifi-3d-fusion' ? (
              <span className="mode-pill mode-pill-simulated" title="Open-Source WiFi-3D-Fusion Engine">
                <span className="mode-dot" />
                WIFI-3D-FUSION (25-Joint Skeletal Mesh)
              </span>
            ) : isSimulated ? (
              <span className="mode-pill mode-pill-simulated" title="Synthetic 2D CSI Kinematic Trajectory">
                <span className="mode-dot" />
                SIMULATION MODE (2D Synthetic Kinematics)
              </span>
            ) : (
              <span className="mode-pill mode-pill-hardware" title="Real Physical Windows WLAN RSSI Proximity">
                <span className="mode-dot" />
                REAL HARDWARE MODE (Windows WLAN RSSI Proximity)
              </span>
            )}
            <span className={`status-pill ${isActive ? 'status-active' : 'status-idle'}`}>
              {isActive ? '● Live Tracking' : '○ Standby'}
            </span>
          </div>
        </div>

        {/* Action controls */}
        <div className="room-controls-bar">
          <div className="view-mode-toggle-group">
            <button
              type="button"
              className={`btn-toggle ${viewMode === '3d' ? 'active' : ''}`}
              onClick={() => setViewMode('3d')}
              title="3D Skeletal Mesh View (WiFi-3D-Fusion)"
            >
              🧊 3D Skeletal Mesh
            </button>
            <button
              type="button"
              className={`btn-toggle ${viewMode === '2d' ? 'active' : ''}`}
              onClick={() => setViewMode('2d')}
              title="2D Tactical Plan View (Fresnel & Heatmap)"
            >
              🗺️ 2D Tactical Plan
            </button>
          </div>

          {viewMode === '2d' && (
            <>
              <button
                type="button"
                className={`btn-toggle ${showGrid ? 'active' : ''}`}
                onClick={() => setShowGrid(!showGrid)}
                title="Toggle 1-Meter Measurement Grid"
              >
                Grid
              </button>
              <button
                type="button"
                className={`btn-toggle ${showTrail ? 'active' : ''}`}
                onClick={() => setShowTrail(!showTrail)}
                title="Toggle Movement Trail"
              >
                Trail
              </button>
              <button
                type="button"
                className={`btn-toggle ${showHeatmap ? 'active' : ''}`}
                onClick={() => setShowHeatmap(!showHeatmap)}
                title="Toggle Presence Heatmap"
              >
                Heatmap
              </button>
              <button
                type="button"
                className={`btn-toggle ${showZones ? 'active' : ''}`}
                onClick={() => setShowZones(!showZones)}
                title="Toggle Architectural Furniture Outline"
              >
                Floor Plan
              </button>
            </>
          )}

          <button
            type="button"
            className={`btn-toggle ${isFullscreen ? 'active' : ''}`}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle Fullscreen Immersive Mode"
          >
            {isFullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
          <button
            type="button"
            className="btn-toggle"
            onClick={() => {
              setCalibWidth(roomDims.widthM);
              setCalibLength(roomDims.lengthM);
              setShowCalibrationModal(true);
            }}
            title="Calibrate Room Dimensions"
          >
            Calibrate ({roomDims.widthM}m × {roomDims.lengthM}m)
          </button>
          {onStepTick && isSimulated && (
            <button
              type="button"
              className="btn-step-action"
              onClick={onStepTick}
              title="Trigger a single manual kinematics step"
            >
              Step Tick
            </button>
          )}
        </div>
      </div>

      {/* Main Room View: 3D Three.js or 2D Canvas */}
      {viewMode === '3d' ? (
        <ThreeRoomView
          currentEvent={activeDisplayEvent}
          historicalEvents={historicalEvents}
          roomWidthM={roomDims.widthM}
          roomLengthM={roomDims.lengthM}
          isSimulated={isSimulated}
          isActive={isActive}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      ) : (
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} className="room-canvas" />
        </div>
      )}

      {/* Scrub / Playback Timeline Bar */}
      <div className="timeline-scrub-bar">
        <div className="timeline-playback-buttons">
          <button
            type="button"
            className="btn-timeline-play"
            onClick={() => setIsPlayingReplay(!isPlayingReplay)}
            disabled={chronologicalEvents.length === 0}
            title={isPlayingReplay ? 'Pause Replay' : 'Replay Recorded History'}
          >
            {isPlayingReplay ? '⏸ Pause' : '▶ Play Replay'}
          </button>
          <button
            type="button"
            className="btn-timeline-speed"
            onClick={() => setReplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 5 : 1))}
          >
            {replaySpeed}x
          </button>
          {scrubIndex !== null && (
            <button
              type="button"
              className="btn-timeline-live"
              onClick={() => {
                setScrubIndex(null);
                setIsPlayingReplay(false);
              }}
              title="Return to real-time live feed"
            >
              ● Return to Live
            </button>
          )}
        </div>

        {/* Range Scrubber */}
        <div className="scrub-slider-area">
          <span className="scrub-time-label">
            {activeDisplayEvent?.timestamp
              ? new Date(activeDisplayEvent.timestamp).toLocaleTimeString()
              : 'Live'}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, chronologicalEvents.length - 1)}
            value={scrubIndex !== null ? scrubIndex : Math.max(0, chronologicalEvents.length - 1)}
            disabled={chronologicalEvents.length <= 1}
            onChange={(e) => {
              setIsPlayingReplay(false);
              setScrubIndex(parseInt(e.target.value, 10));
            }}
            className="timeline-range-input"
          />
          <span className="scrub-count-label">
            {chronologicalEvents.length} recorded states
          </span>
        </div>
      </div>

      {/* Calibration Modal */}
      {showCalibrationModal && (
        <div className="calibration-modal-overlay">
          <div className="calibration-modal">
            <h4>Calibrate Room Dimensions</h4>
            <p className="calibration-modal-sub">
              Adjust room boundaries to accurately scale Wi-Fi sensing coordinate mapping.
            </p>
            <div className="calibration-form">
              <label>
                Room Width (meters):
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="20"
                  value={calibWidth}
                  onChange={(e) => setCalibWidth(parseFloat(e.target.value) || 6.0)}
                />
              </label>
              <label>
                Room Length (meters):
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="20"
                  value={calibLength}
                  onChange={(e) => setCalibLength(parseFloat(e.target.value) || 4.0)}
                />
              </label>
            </div>
            {roomId && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
                  Empty Room Noise Floor Baseline
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '10px' }}>
                  Ensure the room is completely vacant before recording ambient multipath RF baseline.
                </div>
                <button
                  type="button"
                  className="btn-step-action"
                  disabled={isCalibratingBaseline}
                  onClick={async () => {
                    try {
                      setIsCalibratingBaseline(true);
                      setBaselineStatus('Sampling baseline RF floor (5s)...');
                      const res = await recordRoomBaseline(roomId, 5);
                      setBaselineStatus(
                        `Calibrated: noise floor ${res.noise_floor_dbm} dBm, variance ${res.ambient_variance.toFixed(4)} (${res.is_hardware_calibrated ? 'Real Hardware' : 'Simulation'})`
                      );
                    } catch (err: unknown) {
                      setBaselineStatus(`Baseline calibration failed: ${err instanceof Error ? err.message : String(err)}`);
                    } finally {
                      setIsCalibratingBaseline(false);
                    }
                  }}
                >
                  {isCalibratingBaseline ? 'Sampling...' : 'Record Empty Room Baseline'}
                </button>
                {baselineStatus && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#38bdf8' }}>
                    {baselineStatus}
                  </div>
                )}
              </div>
            )}
            <div className="calibration-modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowCalibrationModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-save"
                onClick={handleSaveCalibration}
              >
                Save Dimensions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
