import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { Esp32HardwareStatus } from '../../types';
import './PhysicalSensingWorkspace.css';

interface SpaceProfile {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  isOpenGround: boolean;
  gridDivisions: number;
}

const SPACE_PROFILES: SpaceProfile[] = [
  {
    id: 'standard_room',
    name: 'Standard Room (6m × 4m)',
    widthM: 6.0,
    depthM: 4.0,
    heightM: 2.8,
    isOpenGround: false,
    gridDivisions: 12,
  },
  {
    id: 'large_lab',
    name: 'College Lab / Classroom (10m × 8m)',
    widthM: 10.0,
    depthM: 8.0,
    heightM: 3.5,
    isOpenGround: false,
    gridDivisions: 16,
  },
  {
    id: 'auditorium',
    name: 'Large Hall / Auditorium (16m × 12m)',
    widthM: 16.0,
    depthM: 12.0,
    heightM: 4.5,
    isOpenGround: false,
    gridDivisions: 24,
  },
  {
    id: 'open_ground',
    name: 'Open Field / Ground (24m × 18m)',
    widthM: 24.0,
    depthM: 18.0,
    heightM: 5.0,
    isOpenGround: true,
    gridDivisions: 32,
  },
];

interface TargetItem {
  id: string;
  name?: string;
  role?: string;
  x: number;
  y: number;
  state?: string;
  velocity?: number;
}

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
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const fresnelMeshRef = useRef<THREE.Mesh | null>(null);
  const perturbationGroupRef = useRef<THREE.Group | null>(null);
  const userAvatarRef = useRef<THREE.Group | null>(null);
  const userLimbsRef = useRef<{
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
  } | null>(null);
  const extraAvatarsRef = useRef<THREE.Group[]>([]);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);
  const rfRingsRef = useRef<THREE.Mesh[]>([]);

  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('standard_room');

  const activeProfile =
    SPACE_PROFILES.find((p) => p.id === selectedProfileId) || SPACE_PROFILES[0];

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
    (hardwareStatus?.current_state || '').includes('movement') || motionIntensity > 0.22;
  const isPossiblePresence =
    (hardwareStatus?.current_state || '').includes('presence') || motionIntensity > 0.08;

  // Real data-driven detected targets list from backend
  const detectedTargets: TargetItem[] = ((hardwareStatus?.occupants || []) as unknown as TargetItem[]).map((t, idx) => ({
    id: String(t.id || `target_${idx + 1}`),
    name: String(t.name || `Target #${idx + 1}`),
    role: String(t.role || 'RF Centroid'),
    x: typeof t.x === 'number' ? t.x : Number(t.x) || 3.0,
    y: typeof t.y === 'number' ? t.y : Number(t.y) || 2.0,
    state: String(t.state || 'presence'),
    velocity: typeof t.velocity === 'number' ? t.velocity : 0.0,
  }));
  const activeTargetCount = hardwareStatus?.occupant_count ?? detectedTargets.length;

  // Coordinate mapping relative to active space scale
  const rawX = hardwareStatus?.estimated_x ?? 3.0;
  const rawY = hardwareStatus?.estimated_y ?? 2.0;
  const currentVel = hardwareStatus?.velocity_mps ?? 0.0;

  // Scale normalized coordinates (0..6m -> 0..W, 0..4m -> 0..D)
  const currentScaledX = (rawX / 6.0) * activeProfile.widthM;
  const currentScaledY = (rawY / 4.0) * activeProfile.depthM;

  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { theta, phi, radius } = cameraAngleRef.current;
    const clampedPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi));
    cameraAngleRef.current.phi = clampedPhi;

    const centerX = activeProfile.widthM * 0.5;
    const centerZ = activeProfile.depthM * 0.5;

    const x = radius * Math.sin(clampedPhi) * Math.sin(theta);
    const y = radius * Math.cos(clampedPhi);
    const z = radius * Math.sin(clampedPhi) * Math.cos(theta);

    cameraRef.current.position.set(x + centerX, y, z + centerZ);
    cameraRef.current.lookAt(centerX, 0.8, centerZ);
  }, [activeProfile]);

  // Adjust camera distance when space profile changes
  useEffect(() => {
    const defaultRadius = Math.max(9.0, activeProfile.widthM * 1.35);
    cameraAngleRef.current.radius = defaultRadius;
    updateCameraPosition();
  }, [activeProfile, updateCameraPosition]);

  // Three.js 3D Scene Initialization
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090f);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    cameraRef.current = camera;
    updateCameraPosition();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const W = activeProfile.widthM;
    const D = activeProfile.depthM;
    const H = activeProfile.heightM;
    const centerX = W * 0.5;
    const centerZ = D * 0.5;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.3);
    dirLight.position.set(centerX + 3, H + 8, centerZ + 5);
    scene.add(dirLight);

    // Floor Grid (Scales with selected space)
    const gridSpan = Math.max(W, D) * 1.3;
    const grid = new THREE.GridHelper(gridSpan, activeProfile.gridDivisions, 0x00ffcc, 0x1e293b);
    grid.position.set(centerX, 0, centerZ);
    scene.add(grid);

    // Bounding Box (Enclosed room vs Open Ground)
    if (!activeProfile.isOpenGround) {
      const roomBox = new THREE.BoxGeometry(W, H, D);
      const roomEdges = new THREE.EdgesGeometry(roomBox);
      const roomWire = new THREE.LineSegments(
        roomEdges,
        new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 })
      );
      roomWire.position.set(centerX, H * 0.5, centerZ);
      scene.add(roomWire);
    }

    // Node TX (Router / Phone Hotspot) at 15% width
    const txX = W * 0.15;
    const txZ = centerZ;
    const txGroup = new THREE.Group();
    txGroup.position.set(txX, 1.2, txZ);
    const txGeo = new THREE.BoxGeometry(0.35, 0.12, 0.22);
    const txMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.2 });
    txGroup.add(new THREE.Mesh(txGeo, txMat));

    // Antennas
    const antMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
    [-0.12, 0.12].forEach((offset) => {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), antMat);
      ant.position.set(offset, 0.2, 0);
      txGroup.add(ant);
    });
    scene.add(txGroup);

    // Node RX (ESP32 DevKit V1) at 85% width
    const rxX = W * 0.85;
    const rxZ = centerZ;
    const rxGroup = new THREE.Group();
    rxGroup.position.set(rxX, 0.8, rxZ);
    const rxGeo = new THREE.BoxGeometry(0.25, 0.07, 0.14);
    const rxMat = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.8, roughness: 0.2 });
    rxGroup.add(new THREE.Mesh(rxGeo, rxMat));

    const pcbAnt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.12), antMat);
    pcbAnt.position.set(0.14, 0, 0);
    rxGroup.add(pcbAnt);
    scene.add(rxGroup);

    // Direct Line-of-Sight Laser Ray
    const losGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(txX, 1.2, txZ),
      new THREE.Vector3(rxX, 0.8, rxZ),
    ]);
    const losMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.2,
      gapSize: 0.1,
      linewidth: 2,
    });
    const losLine = new THREE.Line(losGeo, losMat);
    losLine.computeLineDistances();
    scene.add(losLine);

    // 1st Fresnel Zone Ellipsoid (Centered between TX and RX)
    const fresnelSpanX = (rxX - txX) * 0.5;
    const fresnelRadius = Math.min(1.4, D * 0.18);
    const fresnelGeo = new THREE.SphereGeometry(1, 24, 16);
    fresnelGeo.scale(fresnelSpanX, fresnelRadius, fresnelRadius);
    const fresnelMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
    });
    const fresnelMesh = new THREE.Mesh(fresnelGeo, fresnelMat);
    fresnelMesh.position.set(centerX, 1.0, centerZ);
    scene.add(fresnelMesh);
    fresnelMeshRef.current = fresnelMesh;

    // Concentric Electromagnetic Wave Ripples
    const ringsGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.1, 0.16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    rfRingsRef.current = [];
    const stepX = (rxX - txX) / 5;
    for (let i = 1; i <= 4; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.set(txX + i * stepX, 1.0, centerZ);
      ring.rotation.y = Math.PI / 2;
      ringsGroup.add(ring);
      rfRingsRef.current.push(ring);
    }
    scene.add(ringsGroup);
    perturbationGroupRef.current = ringsGroup;

    // --- Dynamic Humanoid Avatar (Target #1 - Primary Mover) ---
    const userAvatar = new THREE.Group();
    userAvatar.position.set(centerX, 0, centerZ);
    userAvatar.visible = false; // Initially hidden until data streams

    const userMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x008877,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.6,
    });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), userMat);
    head.position.y = 1.62;
    userAvatar.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.62, 16), userMat);
    torso.position.y = 1.15;
    userAvatar.add(torso);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
    const armGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.45, 12);

    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.22, 1.35, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -0.22;
    leftArmGroup.add(leftArmMesh);
    userAvatar.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.22, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -0.22;
    rightArmGroup.add(rightArmMesh);
    userAvatar.add(rightArmGroup);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.65, 12);
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.11, 0.7, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, armMat);
    leftLegMesh.position.y = -0.32;
    leftLegGroup.add(leftLegMesh);
    userAvatar.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.11, 0.7, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, armMat);
    rightLegMesh.position.y = -0.32;
    rightLegGroup.add(rightLegMesh);
    userAvatar.add(rightLegGroup);

    userLimbsRef.current = {
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup,
    };

    // Footprint Ground Disc
    const footprintDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.45, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    footprintDisc.rotation.x = Math.PI / 2;
    footprintDisc.position.y = 0.02;
    userAvatar.add(footprintDisc);

    scene.add(userAvatar);
    userAvatarRef.current = userAvatar;

    // --- Secondary Detected Targets (Dynamic: Targets 2, 3, 4) ---
    extraAvatarsRef.current = [];
    const secondaryColors = [0xf59e0b, 0xa855f7, 0x10b981]; // Amber, Violet, Emerald

    secondaryColors.forEach((col, idx) => {
      const extraGroup = new THREE.Group();
      extraGroup.position.set(centerX + (idx + 1) * 1.2, 0, centerZ + (idx % 2 === 0 ? 1.0 : -1.0));
      extraGroup.visible = false; // Initially hidden! Shown ONLY if detected by RF clusters

      const sMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      });

      const sHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), sMat);
      sHead.position.y = 1.58;
      extraGroup.add(sHead);

      const sTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.6, 14), sMat);
      sTorso.position.y = 1.15;
      extraGroup.add(sTorso);

      const sFootprint = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.38, 24),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      sFootprint.rotation.x = Math.PI / 2;
      sFootprint.position.y = 0.02;
      extraGroup.add(sFootprint);

      scene.add(extraGroup);
      extraAvatarsRef.current.push(extraGroup);
    });

    // Breadcrumb Movement Trail
    const maxTrailPoints = 80;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.65,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);
    trailLineRef.current = trailLine;
    trailPointsRef.current = [];

    // Animation Loop
    let animId: number;
    let phase = 0;
    let walkCycle = 0;

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

      // Smooth interpolation of primary user avatar
      if (userAvatarRef.current) {
        const u = userAvatarRef.current;
        const targetX = currentScaledX;
        const targetZ = currentScaledY;

        const dx = targetX - u.position.x;
        const dz = targetZ - u.position.z;
        u.position.x += dx * 0.14;
        u.position.z += dz * 0.14;

        const distanceMoved = Math.sqrt(dx * dx + dz * dz);

        // Walking limb animation
        if (userLimbsRef.current) {
          if (distanceMoved > 0.015 || currentVel > 0.05 || isMovementDetected) {
            walkCycle += 0.2;
            userLimbsRef.current.leftLeg.rotation.x = Math.sin(walkCycle) * 0.55;
            userLimbsRef.current.rightLeg.rotation.x = -Math.sin(walkCycle) * 0.55;
            userLimbsRef.current.leftArm.rotation.x = -Math.sin(walkCycle) * 0.45;
            userLimbsRef.current.rightArm.rotation.x = Math.sin(walkCycle) * 0.45;
          } else {
            userLimbsRef.current.leftLeg.rotation.x *= 0.85;
            userLimbsRef.current.rightLeg.rotation.x *= 0.85;
            userLimbsRef.current.leftArm.rotation.x *= 0.85;
            userLimbsRef.current.rightArm.rotation.x *= 0.85;
          }
        }

        // Record breadcrumb trail point
        if (distanceMoved > 0.02) {
          trailPointsRef.current.push(new THREE.Vector3(u.position.x, 0.04, u.position.z));
          if (trailPointsRef.current.length > maxTrailPoints) {
            trailPointsRef.current.shift();
          }

          if (trailLineRef.current) {
            const posAttr = trailLineRef.current.geometry.attributes.position as THREE.BufferAttribute;
            const pts = trailPointsRef.current;
            for (let i = 0; i < maxTrailPoints; i++) {
              if (i < pts.length) {
                posAttr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
              } else if (pts.length > 0) {
                posAttr.setXYZ(i, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z);
              }
            }
            posAttr.needsUpdate = true;
          }
        }
      }

      // Secondary detected targets smooth motion & dynamic visibility
      extraAvatarsRef.current.forEach((extraAvatar, idx) => {
        const targetIdx = idx + 1; // Target #2, #3, #4
        if (targetIdx < detectedTargets.length) {
          extraAvatar.visible = true;
          const tData = detectedTargets[targetIdx];
          const tX = (tData.x / 6.0) * activeProfile.widthM;
          const tZ = (tData.y / 4.0) * activeProfile.depthM;
          extraAvatar.position.x += (tX - extraAvatar.position.x) * 0.12;
          extraAvatar.position.z += (tZ - extraAvatar.position.z) * 0.12;
          extraAvatar.position.y = 0.02 * Math.sin(phase * 1.5 + idx * 1.2);
        } else {
          extraAvatar.visible = false;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

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
  }, [activeProfile, updateCameraPosition, currentScaledX, currentScaledY, currentVel, isMovementDetected, detectedTargets]);

  // Update Dynamic Visibility of Targets Strictly Based on Real Detected Count
  useEffect(() => {
    if (!fresnelMeshRef.current) return;
    const fresnelMat = fresnelMeshRef.current.material as THREE.MeshBasicMaterial;

    if (isMovementDetected) {
      fresnelMat.color.setHex(0x10b981);
      fresnelMat.opacity = Math.min(0.45, 0.2 + motionIntensity * 0.35);
    } else if (isPossiblePresence) {
      fresnelMat.color.setHex(0xf59e0b);
      fresnelMat.opacity = 0.25;
    } else {
      fresnelMat.color.setHex(0x0284c7);
      fresnelMat.opacity = 0.15;
    }

    // Avatar #1: Visible ONLY when at least 1 target is detected
    if (userAvatarRef.current) {
      userAvatarRef.current.visible = detectedTargets.length >= 1 || isMovementDetected;
    }

    // Secondary Avatars: Visible ONLY if actively detected by RF sub-bands!
    extraAvatarsRef.current.forEach((avatar, idx) => {
      const targetIdx = idx + 1; // Target #2, #3, #4
      // Disappears automatically when people leave!
      avatar.visible = targetIdx < detectedTargets.length;
    });
  }, [isMovementDetected, isPossiblePresence, motionIntensity, detectedTargets.length]);

  // 2D Tactical Radar Canvas Render (Dynamically scaled to active profile)
  useEffect(() => {
    if (viewMode !== '2d') return;
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, width, height);

    const margin = 45;
    const plotW = width - margin * 2;
    const plotH = height - margin * 2;
    const scale = Math.min(plotW / activeProfile.widthM, plotH / activeProfile.depthM);
    const originX = margin + (plotW - activeProfile.widthM * scale) / 2;
    const originY = margin + (plotH - activeProfile.depthM * scale) / 2;

    const toPxX = (mX: number) => originX + mX * scale;
    const toPxY = (mY: number) => originY + mY * scale;

    const W = activeProfile.widthM;
    const D = activeProfile.depthM;

    // Boundaries
    if (!activeProfile.isOpenGround) {
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.strokeRect(originX, originY, W * scale, D * scale);
    } else {
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(originX, originY, W * scale, D * scale);
      ctx.setLineDash([]);
    }

    // Dynamic grid spacing (1m or 2m based on size)
    const gridStep = W > 12 ? 2.0 : 1.0;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = gridStep; x < W; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(toPxX(x), originY);
      ctx.lineTo(toPxX(x), originY + D * scale);
      ctx.stroke();
    }
    for (let y = gridStep; y < D; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(originX, toPxY(y));
      ctx.lineTo(originX + W * scale, toPxY(y));
      ctx.stroke();
    }

    const txX = W * 0.15;
    const rxX = W * 0.85;
    const centerZ = D * 0.5;

    // 1st Fresnel zone ellipse
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      toPxX(W * 0.5),
      toPxY(centerZ),
      ((rxX - txX) * 0.5) * scale,
      Math.min(1.4, D * 0.18) * scale,
      0,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = isMovementDetected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.12)';
    ctx.fill();
    ctx.strokeStyle = isMovementDetected ? '#10b981' : '#0284c7';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();

    // Line of sight
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toPxX(txX), toPxY(centerZ));
    ctx.lineTo(toPxX(rxX), toPxY(centerZ));
    ctx.stroke();

    // Node TX (Router)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(toPxX(txX), toPxY(centerZ), 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#93c5fd';
    ctx.font = '11px sans-serif';
    ctx.fillText('Wi-Fi TX Node', toPxX(txX) - 36, toPxY(centerZ) - 14);

    // Node RX (ESP32)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(toPxX(rxX), toPxY(centerZ), 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = '11px sans-serif';
    ctx.fillText('ESP32 RX (COM7)', toPxX(rxX) - 45, toPxY(centerZ) - 14);

    // Secondary Targets (Render ONLY active detected targets)
    const targetColors = ['#00ffcc', '#f59e0b', '#a855f7', '#10b981'];
    detectedTargets.forEach((tgt, idx) => {
      const tgtX = (tgt.x / 6.0) * W;
      const tgtY = (tgt.y / 4.0) * D;
      const px = toPxX(tgtX);
      const py = toPxY(tgtY);
      const col = targetColors[idx % targetColors.length];

      // Uncertainty halo
      ctx.fillStyle = `${col}33`;
      ctx.beginPath();
      ctx.arc(px, py, 0.4 * scale, 0, 2 * Math.PI);
      ctx.fill();

      // Target core dot
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, idx === 0 ? 9 : 7, 0, 2 * Math.PI);
      ctx.fill();

      // Label
      ctx.fillStyle = '#f8fafc';
      ctx.font = idx === 0 ? 'bold 11px sans-serif' : '10px monospace';
      ctx.fillText(
        `${tgt.name}: (${tgtX.toFixed(2)}m, ${tgtY.toFixed(2)}m)`,
        px - 50,
        py - 14
      );
    });

    if (detectedTargets.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No targets currently detected (Empty / Stationary Space)', width / 2, height / 2);
    }
  }, [viewMode, activeProfile, currentScaledX, currentScaledY, isMovementDetected, detectedTargets]);

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
      const minR = Math.max(4.0, activeProfile.widthM * 0.5);
      const maxR = activeProfile.widthM * 3.0;
      cameraAngleRef.current.radius = Math.max(
        minR,
        Math.min(maxR, cameraAngleRef.current.radius + e.deltaY * 0.005)
      );
      updateCameraPosition();
    }
  };

  const zoomIn = () => {
    const minR = Math.max(4.0, activeProfile.widthM * 0.5);
    cameraAngleRef.current.radius = Math.max(minR, cameraAngleRef.current.radius - 2.0);
    updateCameraPosition();
  };

  const zoomOut = () => {
    const maxR = activeProfile.widthM * 3.0;
    cameraAngleRef.current.radius = Math.min(maxR, cameraAngleRef.current.radius + 2.0);
    updateCameraPosition();
  };

  const resetCamera = () => {
    cameraAngleRef.current = {
      theta: Math.PI / 4,
      phi: Math.PI / 3.2,
      radius: Math.max(9.0, activeProfile.widthM * 1.35),
    };
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
      {/* Header & Space Controls Bar */}
      <div className="physical-header">
        <div className="physical-title-area">
          <div className="physical-title-row">
            <h2 className="physical-title">Physical RF Multipath & Dynamic Spatial Localization</h2>
            <span className={`status-tag ${isStreaming ? 'status-tag--live' : 'status-tag--waiting'}`}>
              {isStreaming ? '● LIVE HARDWARE CSI' : '○ ESP32 AWAITING WI-FI PACKETS'}
            </span>
          </div>
          <div className="physical-subtitle">
            Dynamic Wi-Fi 802.11 subcarrier multipath tracking | Transceiver Baseline: {(activeProfile.widthM * 0.7).toFixed(1)}m
          </div>
        </div>

        <div className="physical-actions">
          {/* Space Profile Dimension Selector */}
          <div className="space-profile-selector" title="Switch spatial tracking volume">
            <label htmlFor="space-profile-select" style={{ fontSize: '11px', color: '#94a3b8', marginRight: '6px' }}>
              Space:
            </label>
            <select
              id="space-profile-select"
              className="space-profile-select"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
            >
              {SPACE_PROFILES.map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.name}
                </option>
              ))}
            </select>
          </div>

          <div className="view-mode-toggle">
            <button
              className={`btn-toggle ${viewMode === '3d' ? 'btn-toggle--active' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D Dynamic View
            </button>
            <button
              className={`btn-toggle ${viewMode === '2d' ? 'btn-toggle--active' : ''}`}
              onClick={() => setViewMode('2d')}
            >
              2D Tactical Radar
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

      {/* Physics Notice & Real Dynamic Positioning Guide */}
      <div className="physical-physics-notice">
        <span className="notice-icon">📡</span>
        <div className="notice-content">
          <strong>Dynamic RF Multi-Target Localization:</strong> Evaluates subcarrier spectral asymmetry (along-axis distance) and multipath delay frequency (lateral displacement). Targets dynamically glide to real measured coordinates $(X, Y)$. Target counts are determined strictly by subcarrier variance entropy and spatial cluster decomposition without artificial placeholders.
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
        {viewMode === '3d' ? (
          <div ref={mountRef} className="physical-three-mount" />
        ) : (
          <canvas
            ref={canvas2dRef}
            width={860}
            height={520}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}

        {/* 3D Glass HUD Top Overlay */}
        <div className="physical-hud-top">
          <div className="hud-badge-group">
            <span className="hud-badge" style={{ color: '#00ffcc', borderColor: '#00ffcc' }}>
              📍 Primary: X: {currentScaledX.toFixed(2)}m, Y: {currentScaledY.toFixed(2)}m
            </span>
            <span className="hud-badge">Speed: {currentVel.toFixed(2)} m/s</span>
            <span
              className="hud-badge"
              style={{
                color: activeTargetCount > 0 ? '#34d399' : '#94a3b8',
                borderColor: activeTargetCount > 0 ? '#10b981' : '#475569',
              }}
            >
              🎯 Detected Targets: {activeTargetCount}
            </span>
            <span className="hud-badge">Profile: {activeProfile.name}</span>
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
                ? 'STATIONARY SPACE'
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
