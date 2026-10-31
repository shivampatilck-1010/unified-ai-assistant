import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { Esp32HardwareStatus } from '../../types';
import './PhysicalSensingWorkspace.css';

interface PhysicalSensingWorkspaceProps {
  hardwareStatus: Esp32HardwareStatus | null;
  onCalibrate?: (durationSec: number) => Promise<void>;
  onClearCalibration?: () => Promise<void>;
}

export const PhysicalSensingWorkspace: React.FC<PhysicalSensingWorkspaceProps> = ({
  hardwareStatus,
  onCalibrate,
  onClearCalibration,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const fresnelMeshRef = useRef<THREE.Mesh | null>(null);
  const perturbationGroupRef = useRef<THREE.Group | null>(null);
  const presenceMarkerRef = useRef<THREE.Group | null>(null);
  const rfRingsRef = useRef<THREE.Mesh[]>([]);

  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);

  // Orbit state
  const isDraggingRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAngleRef = useRef<{ theta: number; phi: number; radius: number }>({
    theta: Math.PI / 4,
    phi: Math.PI / 3.2,
    radius: 9.0,
  });

  const isStreaming = hardwareStatus?.is_streaming ?? false;
  const motionIntensity = hardwareStatus?.motion_intensity ?? 0.0;
  const isMovementDetected =
    (hardwareStatus?.current_state || '').includes('movement') || motionIntensity > 0.25;
  const isPossiblePresence =
    (hardwareStatus?.current_state || '').includes('presence') || motionIntensity > 0.1;

  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { theta, phi, radius } = cameraAngleRef.current;
    const clampedPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi));
    cameraAngleRef.current.phi = clampedPhi;

    const x = radius * Math.sin(clampedPhi) * Math.sin(theta);
    const y = radius * Math.cos(clampedPhi);
    const z = radius * Math.sin(clampedPhi) * Math.cos(theta);

    cameraRef.current.position.set(x + 3.0, y, z + 2.0);
    cameraRef.current.lookAt(3.0, 0.8, 2.0);
  }, []);

  // Three.js Scene Initialization
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090f);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCameraPosition();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(4, 10, 6);
    scene.add(dirLight);

    // Floor Grid (6m x 4m room)
    const grid = new THREE.GridHelper(8, 16, 0x00ffcc, 0x1e293b);
    grid.position.set(3.0, 0, 2.0);
    scene.add(grid);

    // Room Wireframe
    const roomBox = new THREE.BoxGeometry(6.0, 2.8, 4.0);
    const roomEdges = new THREE.EdgesGeometry(roomBox);
    const roomWire = new THREE.LineSegments(
      roomEdges,
      new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 })
    );
    roomWire.position.set(3.0, 1.4, 2.0);
    scene.add(roomWire);

    // TX Router Node at (1.0, 1.2, 2.0)
    const txGroup = new THREE.Group();
    txGroup.position.set(1.0, 1.2, 2.0);
    const txGeo = new THREE.BoxGeometry(0.3, 0.1, 0.2);
    const txMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.2 });
    txGroup.add(new THREE.Mesh(txGeo, txMat));

    // Antennas
    const antMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
    [-0.1, 0.1].forEach((offset) => {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25), antMat);
      ant.position.set(offset, 0.15, 0);
      txGroup.add(ant);
    });
    scene.add(txGroup);

    // RX ESP32 Node on COM7 at (5.0, 0.8, 2.0)
    const rxGroup = new THREE.Group();
    rxGroup.position.set(5.0, 0.8, 2.0);
    const rxGeo = new THREE.BoxGeometry(0.22, 0.06, 0.12);
    const rxMat = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.8, roughness: 0.2 });
    rxGroup.add(new THREE.Mesh(rxGeo, rxMat));

    // PCB Antenna
    const pcbAnt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), antMat);
    pcbAnt.position.set(0.12, 0, 0);
    rxGroup.add(pcbAnt);
    scene.add(rxGroup);

    // Direct Line-of-Sight Laser Ray
    const losGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(1.0, 1.2, 2.0),
      new THREE.Vector3(5.0, 0.8, 2.0),
    ]);
    const losMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.15,
      gapSize: 0.08,
      linewidth: 2,
    });
    const losLine = new THREE.Line(losGeo, losMat);
    losLine.computeLineDistances();
    scene.add(losLine);

    // 1st Fresnel Zone Ellipsoid (Centered between TX and RX at (3.0, 1.0, 2.0))
    const fresnelGeo = new THREE.SphereGeometry(1, 24, 16);
    fresnelGeo.scale(2.0, 0.65, 0.65); // Ellipsoid: length=4m, radius=0.65m
    const fresnelMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
    });
    const fresnelMesh = new THREE.Mesh(fresnelGeo, fresnelMat);
    fresnelMesh.position.set(3.0, 1.0, 2.0);
    scene.add(fresnelMesh);
    fresnelMeshRef.current = fresnelMesh;

    // Concentric Electromagnetic Wave Ripples
    const ringsGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    rfRingsRef.current = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.set(1.5 + i * 0.8, 1.0, 2.0);
      ring.rotation.y = Math.PI / 2;
      ringsGroup.add(ring);
      rfRingsRef.current.push(ring);
    }
    scene.add(ringsGroup);
    perturbationGroupRef.current = ringsGroup;

    // Biological Presence Marker (Gated by CSI physical variance)
    const markerGroup = new THREE.Group();
    markerGroup.position.set(3.0, 0, 2.0);
    markerGroup.visible = false;

    // Glowing base ring
    const markerBase = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.45, 32),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    markerBase.rotation.x = Math.PI / 2;
    markerBase.position.y = 0.02;
    markerGroup.add(markerBase);

    // Semi-transparent presence cylinder (Human silhouette area)
    const markerBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1.7, 16),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.45,
        roughness: 0.3,
        emissive: 0x059669,
        emissiveIntensity: 0.4,
      })
    );
    markerBody.position.y = 0.85;
    markerGroup.add(markerBody);

    scene.add(markerGroup);
    presenceMarkerRef.current = markerGroup;

    // Animation Loop
    let animId: number;
    let phase = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      phase += 0.04;

      // Animate Fresnel wave propagation
      rfRingsRef.current.forEach((r, idx) => {
        const s = 1.0 + ((phase + idx * 0.75) % 2.5);
        r.scale.set(s, s, s);
        const mat = r.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.5 - (s - 1.0) * 0.2);
      });

      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver for dynamic full-width adaptation
    const updateDimensions = (w: number, h: number) => {
      if (!rendererRef.current || !cameraRef.current || w <= 0 || h <= 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) updateDimensions(rw, rh);
      }
    });
    resizeObserver.observe(container);

    const onWinResize = () => {
      if (container) updateDimensions(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onWinResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [updateCameraPosition]);

  // Update Dynamic Visual Elements on Hardware Telemetry Changes
  useEffect(() => {
    if (!fresnelMeshRef.current || !presenceMarkerRef.current) return;

    const fresnelMat = fresnelMeshRef.current.material as THREE.MeshBasicMaterial;

    if (isMovementDetected) {
      // Dynamic green/amber illumination on movement
      fresnelMat.color.setHex(0x10b981);
      fresnelMat.opacity = Math.min(0.45, 0.2 + motionIntensity * 0.35);
      presenceMarkerRef.current.visible = true;
    } else if (isPossiblePresence) {
      fresnelMat.color.setHex(0xf59e0b);
      fresnelMat.opacity = 0.25;
      presenceMarkerRef.current.visible = true;
    } else {
      fresnelMat.color.setHex(0x0284c7);
      fresnelMat.opacity = 0.15;
      presenceMarkerRef.current.visible = false;
    }
  }, [isMovementDetected, isPossiblePresence, motionIntensity]);

  // Orbit controls
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    cameraAngleRef.current.theta -= deltaX * 0.008;
    cameraAngleRef.current.phi += deltaY * 0.008;
    updateCameraPosition();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || isFullscreen) {
      e.preventDefault();
      cameraAngleRef.current.radius = Math.max(3.5, Math.min(20.0, cameraAngleRef.current.radius + e.deltaY * 0.005));
      updateCameraPosition();
    }
  };

  const zoomIn = () => {
    cameraAngleRef.current.radius = Math.max(3.5, cameraAngleRef.current.radius - 1.5);
    updateCameraPosition();
  };

  const zoomOut = () => {
    cameraAngleRef.current.radius = Math.min(20.0, cameraAngleRef.current.radius + 1.5);
    updateCameraPosition();
  };

  const resetCamera = () => {
    cameraAngleRef.current = { theta: Math.PI / 4, phi: Math.PI / 3.2, radius: 9.0 };
    updateCameraPosition();
  };

  const handleStartCalibration = async () => {
    if (!onCalibrate) return;
    try {
      setIsCalibrating(true);
      await onCalibrate(5.0);
    } finally {
      setIsCalibrating(false);
    }
  };

  return (
    <div className={`physical-workspace-card ${isFullscreen ? 'physical-workspace-card--fullscreen' : ''}`}>
      {/* Header & Controls Bar */}
      <div className="physical-header">
        <div className="physical-title-area">
          <div className="physical-title-row">
            <h2 className="physical-title">Physical RF Multipath & Fresnel Zone Workspace</h2>
            <span className={`status-tag ${isStreaming ? 'status-tag--live' : 'status-tag--waiting'}`}>
              {isStreaming ? '● LIVE HARDWARE CSI' : '○ ESP32 AWAITING WI-FI PACKETS'}
            </span>
          </div>
          <div className="physical-subtitle">
            1st Fresnel Zone between Router (TX: 1.0m, 1.2m) and ESP32 DevKit V1 (RX: 5.0m, 0.8m on COM7)
          </div>
        </div>

        <div className="physical-actions">
          <div className="view-mode-toggle">
            <button
              className={`btn-toggle ${viewMode === '3d' ? 'btn-toggle--active' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D Fresnel Room
            </button>
            <button
              className={`btn-toggle ${viewMode === '2d' ? 'btn-toggle--active' : ''}`}
              onClick={() => setViewMode('2d')}
            >
              2D Tactical Plan
            </button>
          </div>

          <button
            className="btn-calib"
            onClick={handleStartCalibration}
            disabled={isCalibrating || !hardwareStatus?.is_connected}
            title="Records 5-second empty room noise floor to calibrate presence thresholds"
          >
            {isCalibrating ? 'Calibrating (5s)...' : 'Calibrate Room Noise'}
          </button>

          {onClearCalibration && hardwareStatus?.is_calibrated && (
            <button className="btn-calib-reset" onClick={onClearCalibration} title="Reset calibration baseline">
              Reset Baseline
            </button>
          )}

          <button
            className="btn-fs"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Physics & Single-Link Disclosures */}
      <div className="physical-physics-notice">
        <span className="notice-icon">ℹ️</span>
        <div className="notice-content">
          <strong>Single-Link RF Sensing Physics:</strong> This physical workspace tracks real-time Fresnel zone
          perturbation and Doppler phase velocity between your Wi-Fi router and ESP32 DevKit V1. Human presence is
          detected when biological water mass disrupts the line-of-sight multipath subcarriers. Full 3D coordinate
          triangulation requires multi-anchor trilateration (3+ receivers). No synthetic skeleton coordinates are
          fabricated.
        </div>
      </div>

      {/* Main 3D / 2D View Container */}
      <div
        className="physical-mount-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div ref={mountRef} className="physical-three-mount" />

        {/* 3D Glass HUD Overlay */}
        <div className="physical-hud-top">
          <div className="hud-badge-group">
            <span className="hud-badge">Node RX: ESP32 DevKit V1 (COM7)</span>
            <span className="hud-badge">Carrier: 2.4 GHz (802.11n HT20)</span>
            <span className="hud-badge">Baud: 921,600</span>
          </div>

          <div className="hud-controls">
            <button className="hud-btn" onClick={zoomIn} title="Zoom Camera In">+</button>
            <button className="hud-btn" onClick={zoomOut} title="Zoom Camera Out">−</button>
            <button className="hud-btn" onClick={resetCamera} title="Reset Camera Orbit">⟲ Orbit</button>
          </div>
        </div>

        {/* 3D Glass HUD Bottom Telemetry */}
        <div className="physical-hud-bottom">
          <div className="hud-metric">
            <span className="hud-label">Physical State:</span>
            <span
              className="hud-val"
              style={{
                color: isMovementDetected ? '#34d399' : isPossiblePresence ? '#fbbf24' : '#93c5fd',
              }}
            >
              {isMovementDetected
                ? 'MOVEMENT DETECTED'
                : isPossiblePresence
                ? 'POSSIBLE PRESENCE'
                : isStreaming
                ? 'NO MOVEMENT (STATIC)'
                : 'AWAITING CSI'}
            </span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">Fresnel Perturbation:</span>
            <span className="hud-val">{motionIntensity.toFixed(2)}</span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">RSSI:</span>
            <span className="hud-val">{hardwareStatus?.rssi_dbm ? `${hardwareStatus.rssi_dbm} dBm` : '—'}</span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">Subcarriers:</span>
            <span className="hud-val">{hardwareStatus?.subcarrier_amplitudes?.length ?? 64} OFDM</span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">Total Frames:</span>
            <span className="hud-val">{(hardwareStatus?.packets_captured ?? 0).toLocaleString()}</span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">Throughput:</span>
            <span className="hud-val">{(hardwareStatus?.packets_per_second ?? 0).toFixed(1)} pkts/s</span>
          </div>

          <div className="hud-metric">
            <span className="hud-label">Calibration:</span>
            <span className="hud-val highlight">
              {hardwareStatus?.is_calibrated ? 'CALIBRATED' : 'UNCALIBRATED'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
