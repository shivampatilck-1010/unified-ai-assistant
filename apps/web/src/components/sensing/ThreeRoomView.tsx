import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { SensingEvent } from '../../types';
import './ThreeRoomView.css';

interface ThreeRoomViewProps {
  currentEvent: SensingEvent | null;
  historicalEvents: SensingEvent[];
  roomWidthM: number;
  roomLengthM: number;
  isSimulated: boolean;
  isActive: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

// 25-joint humanoid connection pairs (COCO topology from WiFi-3D-Fusion)
const SKELETON_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],     // Right arm
  [1, 5], [5, 6], [6, 7],             // Left arm
  [1, 8], [8, 9], [9, 10], [10, 11],  // Right leg
  [8, 12], [12, 13], [13, 14],        // Left leg
  [0, 15], [15, 17], [0, 16], [16, 18], // Head/face
  [14, 19], [19, 20], [14, 21],       // Left foot
  [11, 22], [22, 23], [11, 24]        // Right foot
];

export const ThreeRoomView: React.FC<ThreeRoomViewProps> = ({
  currentEvent,
  historicalEvents,
  roomWidthM = 6.0,
  roomLengthM = 4.0,
  isSimulated,
  isActive,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Dynamic 3D Objects
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const extraAvatarsRef = useRef<THREE.Group[]>([]);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const uncertaintyMeshRef = useRef<THREE.Mesh | null>(null);
  const rfWavesGroupRef = useRef<THREE.Group | null>(null);
  const jointMeshesRef = useRef<THREE.Mesh[]>([]);
  const boneLinesRef = useRef<THREE.Line[]>([]);

  // Camera Orbit State
  const isDraggingRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAngleRef = useRef<{ theta: number; phi: number; radius: number }>({
    theta: Math.PI / 4,
    phi: Math.PI / 3,
    radius: 9.5,
  });

  // Telemetry HUD state
  const [hudCoords, setHudCoords] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [hudConfidence, setHudConfidence] = useState<number>(0);
  const [hudFps, setHudFps] = useState<number>(10);
  const [jointCount, setJointCount] = useState<number>(0);
  const [hudOccupants, setHudOccupants] = useState<number>(1);

  // Update Camera Orbit based on spherical coordinates
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { theta, phi, radius } = cameraAngleRef.current;
    const clampedPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi));
    cameraAngleRef.current.phi = clampedPhi;

    const x = radius * Math.sin(clampedPhi) * Math.sin(theta);
    const y = radius * Math.cos(clampedPhi);
    const z = radius * Math.sin(clampedPhi) * Math.cos(theta);

    cameraRef.current.position.set(x + roomWidthM / 2, y, z + roomLengthM / 2);
    cameraRef.current.lookAt(roomWidthM / 2, 0.8, roomLengthM / 2);
  }, [roomWidthM, roomLengthM]);

  // Initial Scene Setup
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090f);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00ffcc, 1.2);
    dirLight.position.set(5, 12, 7);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x0088ff, 1.5, 15);
    pointLight.position.set(roomWidthM / 2, 3, roomLengthM / 2);
    scene.add(pointLight);

    // 5. Room Grid & Bounding Box
    const gridHelper = new THREE.GridHelper(
      Math.max(roomWidthM, roomLengthM) * 1.5,
      Math.round(Math.max(roomWidthM, roomLengthM) * 2),
      0x00ffaa,
      0x1a2e3b
    );
    gridHelper.position.set(roomWidthM / 2, 0, roomLengthM / 2);
    scene.add(gridHelper);

    // Translucent Room Walls Wireframe
    const roomBoxGeo = new THREE.BoxGeometry(roomWidthM, 2.8, roomLengthM);
    const roomEdges = new THREE.EdgesGeometry(roomBoxGeo);
    const roomWireframe = new THREE.LineSegments(
      roomEdges,
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.35 })
    );
    roomWireframe.position.set(roomWidthM / 2, 1.4, roomLengthM / 2);
    scene.add(roomWireframe);

    // Translucent Floor Panel
    const floorGeo = new THREE.PlaneGeometry(roomWidthM, roomLengthM);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x071520,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = Math.PI / 2;
    floorMesh.position.set(roomWidthM / 2, 0, roomLengthM / 2);
    scene.add(floorMesh);

    // 6. Wi-Fi AP & RX Anchors
    const apGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.28, 16);
    const apMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x004422 });
    const apMesh = new THREE.Mesh(apGeo, apMat);
    apMesh.position.set(0.4, 1.8, 0.4);
    scene.add(apMesh);

    // RX Anchor
    const rxMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.28, 16),
      new THREE.MeshStandardMaterial({ color: 0x00bbff, emissive: 0x002244 })
    );
    rxMesh.position.set(roomWidthM - 0.4, 1.8, roomLengthM - 0.4);
    scene.add(rxMesh);

    // RF Waves ripple group
    const rfWavesGroup = new THREE.Group();
    for (let r = 0; r < 3; r++) {
      const ringGeo = new THREE.RingGeometry(0.3 + r * 0.4, 0.35 + r * 0.4, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.4 - r * 0.1,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0.4, 0.05, 0.4);
      rfWavesGroup.add(ring);
    }
    scene.add(rfWavesGroup);
    rfWavesGroupRef.current = rfWavesGroup;

    // 7. Dynamic Human Skeleton Group
    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);
    skeletonGroupRef.current = skeletonGroup;

    // Create 25 Joint Spheres
    jointMeshesRef.current = [];
    const jointGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x0088aa,
      roughness: 0.2,
      metalness: 0.8,
    });

    for (let i = 0; i < 25; i++) {
      const jm = new THREE.Mesh(jointGeo, jointMat);
      jm.visible = false;
      skeletonGroup.add(jm);
      jointMeshesRef.current.push(jm);
    }

    // Create Bone Lines
    boneLinesRef.current = [];
    const boneMat = new THREE.LineBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.85,
      linewidth: 2,
    });

    for (let i = 0; i < SKELETON_CONNECTIONS.length; i++) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0),
      ]);
      const line = new THREE.Line(lineGeo, boneMat);
      line.visible = false;
      skeletonGroup.add(line);
      boneLinesRef.current.push(line);
    }

    // Uncertainty Footprint Disc
    const uncGeo = new THREE.RingGeometry(0.1, 0.45, 32);
    const uncMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const uncMesh = new THREE.Mesh(uncGeo, uncMat);
    uncMesh.rotation.x = Math.PI / 2;
    uncMesh.position.y = 0.02;
    scene.add(uncMesh);
    uncertaintyMeshRef.current = uncMesh;

    // Extra Multi-Occupant Avatar Groups (Roommates 2, 3, 4)
    extraAvatarsRef.current = [];
    const extraColors = [
      { main: 0xf59e0b, emissive: 0xb45309 }, // Amber (Subject #2)
      { main: 0xa855f7, emissive: 0x7e22ce }, // Violet (Subject #3)
      { main: 0x10b981, emissive: 0x047857 }, // Emerald (Subject #4)
    ];

    extraColors.forEach((col) => {
      const avatarGroup = new THREE.Group();
      avatarGroup.visible = false;

      // Head
      const headMat = new THREE.MeshStandardMaterial({
        color: col.main,
        emissive: col.emissive,
        roughness: 0.3,
        metalness: 0.7,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), headMat);
      head.position.y = 1.62;
      avatarGroup.add(head);

      // Torso
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.65, 12), headMat);
      torso.position.y = 1.15;
      avatarGroup.add(torso);

      // Floor footprint disc
      const footMat = new THREE.MeshBasicMaterial({
        color: col.main,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const foot = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.35, 24), footMat);
      foot.rotation.x = Math.PI / 2;
      foot.position.y = 0.02;
      avatarGroup.add(foot);

      scene.add(avatarGroup);
      extraAvatarsRef.current.push(avatarGroup);
    });

    // 8. Historical Trail Line
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x00bbff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);
    trailLineRef.current = trailLine;

    // Animation Loop
    let animationFrameId: number;
    let wavePhase = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Animate RF waves
      if (rfWavesGroupRef.current) {
        wavePhase += 0.03;
        rfWavesGroupRef.current.children.forEach((child, idx) => {
          const s = 1.0 + ((wavePhase + idx * 0.7) % 3.0);
          child.scale.set(s, s, s);
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, 0.4 - (s - 1.0) * 0.13);
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // Dynamic Container Resize Observer & Window Resize Handler
    const updateDimensions = (w: number, h: number) => {
      if (!rendererRef.current || !cameraRef.current || w <= 0 || h <= 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          updateDimensions(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    const onWinResize = () => {
      if (container) {
        updateDimensions(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onWinResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [roomWidthM, roomLengthM, updateCameraPosition]);

  // Update Dynamic Skeleton & Position Data on New Sensing Events
  useEffect(() => {
    if (!currentEvent) {
      if (uncertaintyMeshRef.current) uncertaintyMeshRef.current.visible = false;
      jointMeshesRef.current.forEach((m) => (m.visible = false));
      boneLinesRef.current.forEach((l) => (l.visible = false));
      return;
    }

    const raw = (currentEvent.raw_metrics || {}) as Record<string, unknown>;
    const x = typeof currentEvent.estimated_x === 'number'
      ? currentEvent.estimated_x
      : typeof raw.position_x === 'number'
      ? raw.position_x
      : 3.0;
    const y = typeof currentEvent.estimated_y === 'number'
      ? currentEvent.estimated_y
      : typeof raw.position_y === 'number'
      ? raw.position_y
      : 2.0;
    const uncertainty = typeof currentEvent.uncertainty_radius_m === 'number'
      ? currentEvent.uncertainty_radius_m
      : typeof raw.uncertainty_radius_m === 'number'
      ? raw.uncertainty_radius_m
      : 0.35;
    const confidence = typeof raw.confidence === 'number'
      ? raw.confidence
      : typeof currentEvent.presence_probability === 'number'
      ? currentEvent.presence_probability
      : 0.9;
    const fps = typeof raw.fps === 'number' ? raw.fps : 10.0;

    // Check if 25-joint 3D skeleton is supplied by WiFi-3D-Fusion
    const skeletonData = raw.skeleton_3d as number[][] | undefined;

    if (skeletonData && Array.isArray(skeletonData) && skeletonData.length === 25) {
      setJointCount(25);
      // Update each joint sphere position (x, height, y) -> in Three.js Z is depth, Y is up
      skeletonData.forEach((pt, idx) => {
        const jm = jointMeshesRef.current[idx];
        if (jm) {
          jm.visible = true;
          jm.position.set(pt[0], pt[2], pt[1]); // x=x, y=height, z=depth
        }
      });

      // Update bone lines
      SKELETON_CONNECTIONS.forEach((pair, idx) => {
        const line = boneLinesRef.current[idx];
        const p1 = skeletonData[pair[0]];
        const p2 = skeletonData[pair[1]];
        if (line && p1 && p2) {
          line.visible = true;
          const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
          posAttr.setXYZ(0, p1[0], p1[2], p1[1]);
          posAttr.setXYZ(1, p2[0], p2[2], p2[1]);
          posAttr.needsUpdate = true;
        }
      });
    } else {
      // Fallback synthetic avatar
      setJointCount(1);
      const headMesh = jointMeshesRef.current[0];
      if (headMesh) {
        headMesh.visible = true;
        headMesh.position.set(x, 1.7, y);
      }
      for (let i = 1; i < 25; i++) {
        if (jointMeshesRef.current[i]) jointMeshesRef.current[i].visible = false;
      }
      boneLinesRef.current.forEach((l) => (l.visible = false));
    }

    // Update Uncertainty Disc
    if (uncertaintyMeshRef.current) {
      uncertaintyMeshRef.current.visible = true;
      uncertaintyMeshRef.current.position.set(x, 0.02, y);
      const scale = Math.max(0.2, uncertainty * 2.0);
      uncertaintyMeshRef.current.scale.set(scale, scale, 1);
    }

    // Multi-occupant avatar positioning (Roommates 2, 3, 4)
    interface MultiSubject {
      subject_id: string;
      x: number;
      y: number;
      presence_state?: string;
      velocity_mps?: number;
      uncertainty_radius_m?: number;
    }
    const tracked = (raw.tracked_subjects as MultiSubject[] | undefined) || [];

    extraAvatarsRef.current.forEach((av, idx) => {
      const sub = tracked[idx + 1];
      if (sub && typeof sub.x === 'number' && typeof sub.y === 'number') {
        av.visible = true;
        av.position.set(sub.x, 0.0, sub.y);
      } else {
        av.visible = false;
      }
    });

    // Update HUD telemetry
    setHudCoords({ x, y, z: 0.0 });
    setHudConfidence(Math.round(confidence * 100));
    setHudFps(fps);
    setHudOccupants(tracked.length > 0 ? tracked.length : 1);
  }, [currentEvent]);

  // Update 3D Historical Movement Trail
  useEffect(() => {
    if (!trailLineRef.current || historicalEvents.length === 0) return;

    const points: THREE.Vector3[] = [];
    const sorted = [...historicalEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sorted.slice(-40).forEach((evt) => {
      const raw = (evt.raw_metrics || {}) as Record<string, unknown>;
      const x = typeof evt.estimated_x === 'number'
        ? evt.estimated_x
        : typeof raw.position_x === 'number'
        ? raw.position_x
        : null;
      const y = typeof evt.estimated_y === 'number'
        ? evt.estimated_y
        : typeof raw.position_y === 'number'
        ? raw.position_y
        : null;
      if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
        points.push(new THREE.Vector3(x, 0.15, y));
      }
    });

    if (points.length > 1) {
      trailLineRef.current.geometry.setFromPoints(points);
      trailLineRef.current.visible = true;
    } else {
      trailLineRef.current.visible = false;
    }
  }, [historicalEvents]);

  // Mouse Interaction Handlers for Camera Orbit
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;

    cameraAngleRef.current.theta -= deltaX * 0.008;
    cameraAngleRef.current.phi -= deltaY * 0.008;

    updateCameraPosition();
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Only intercept wheel zoom if Ctrl key is held or in Fullscreen mode.
    // This allows natural page scrolling when moving the mouse wheel over the 3D room.
    if (e.ctrlKey || isFullscreen) {
      e.preventDefault();
      cameraAngleRef.current.radius += e.deltaY * 0.005;
      cameraAngleRef.current.radius = Math.max(3.0, Math.min(20.0, cameraAngleRef.current.radius));
      updateCameraPosition();
    }
  };

  const zoomIn = () => {
    cameraAngleRef.current.radius = Math.max(3.0, cameraAngleRef.current.radius - 1.5);
    updateCameraPosition();
  };

  const zoomOut = () => {
    cameraAngleRef.current.radius = Math.min(20.0, cameraAngleRef.current.radius + 1.5);
    updateCameraPosition();
  };

  const resetCamera = () => {
    cameraAngleRef.current = {
      theta: Math.PI / 4,
      phi: Math.PI / 3,
      radius: 9.5,
    };
    updateCameraPosition();
  };

  return (
    <div
      className={`three-room-container ${isFullscreen ? 'fullscreen-view' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div ref={mountRef} className="three-canvas-mount" />

      {/* Glass HUD Overlay */}
      <div className="three-hud-top">
        <div className="hud-badge-group">
          <span className={`engine-badge ${isSimulated ? 'badge-simulation' : 'badge-hardware'}`}>
            {isSimulated ? '⚡ WiFi-3D-Fusion (Kinematic Replay)' : '📡 ESP32 CSI Hardware'}
          </span>
          <span className={`status-pill ${isActive ? 'pill-active' : 'pill-idle'}`}>
            {isActive ? '● STREAMING' : '○ STANDBY'}
          </span>
        </div>

        <div className="hud-actions">
          <button className="hud-btn" onClick={zoomIn} title="Zoom 3D Camera In">
            +
          </button>
          <button className="hud-btn" onClick={zoomOut} title="Zoom 3D Camera Out">
            −
          </button>
          <button className="hud-btn" onClick={resetCamera} title="Reset 3D Camera">
            ⟲ Orbit
          </button>
          {onToggleFullscreen && (
            <button className="hud-btn" onClick={onToggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
            </button>
          )}
        </div>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="three-hud-bottom">
        <div className="telemetry-item">
          <span className="telemetry-label">3D Position:</span>
          <span className="telemetry-val">
            X: {hudCoords.x.toFixed(2)}m | Y: {hudCoords.y.toFixed(2)}m
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Confidence:</span>
          <span className="telemetry-val">{hudConfidence}%</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Skeletal Mesh:</span>
          <span className="telemetry-val highlight">{jointCount}/25 Joints</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Throughput:</span>
          <span className="telemetry-val">{hudFps.toFixed(1)} FPS</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Occupancy:</span>
          <span className="telemetry-val highlight">{hudOccupants} {hudOccupants === 1 ? 'Person' : 'People'}</span>
        </div>
      </div>
    </div>
  );
};
