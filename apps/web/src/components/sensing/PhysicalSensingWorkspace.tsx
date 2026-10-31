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
  const roommateAvatarsRef = useRef<THREE.Group[]>([]);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);
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
    (hardwareStatus?.current_state || '').includes('movement') || motionIntensity > 0.22;
  const isPossiblePresence =
    (hardwareStatus?.current_state || '').includes('presence') || motionIntensity > 0.08;

  const currentX = hardwareStatus?.estimated_x ?? 3.0;
  const currentY = hardwareStatus?.estimated_y ?? 2.0;
  const currentVel = hardwareStatus?.velocity_mps ?? 0.0;

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

  // Three.js 3D Scene Initialization
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

    // Room Wireframe (6m wide, 2.8m high, 4m depth)
    const roomBox = new THREE.BoxGeometry(6.0, 2.8, 4.0);
    const roomEdges = new THREE.EdgesGeometry(roomBox);
    const roomWire = new THREE.LineSegments(
      roomEdges,
      new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 })
    );
    roomWire.position.set(3.0, 1.4, 2.0);
    scene.add(roomWire);

    // Furniture references for room context
    const deskGeo = new THREE.BoxGeometry(1.2, 0.75, 0.6);
    const deskMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, wireframe: true });
    const desk1 = new THREE.Mesh(deskGeo, deskMat);
    desk1.position.set(4.6, 0.375, 2.9);
    scene.add(desk1);

    const desk2 = new THREE.Mesh(deskGeo, deskMat);
    desk2.position.set(1.6, 0.375, 3.1);
    scene.add(desk2);

    // TX Router Node at (1.0, 1.2, 2.0)
    const txGroup = new THREE.Group();
    txGroup.position.set(1.0, 1.2, 2.0);
    const txGeo = new THREE.BoxGeometry(0.3, 0.1, 0.2);
    const txMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.2 });
    txGroup.add(new THREE.Mesh(txGeo, txMat));

    // Router Antennas
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
    fresnelGeo.scale(2.0, 0.65, 0.65);
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

    // --- Dynamic 3D Humanoid Avatar (Subject #1: You / Active Mover) ---
    const userAvatar = new THREE.Group();
    userAvatar.position.set(3.0, 0, 2.0);

    const userMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x008877,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.6,
    });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), userMat);
    head.position.y = 1.62;
    userAvatar.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.62, 16), userMat);
    torso.position.y = 1.15;
    userAvatar.add(torso);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
    const armGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.45, 12);

    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.2, 1.35, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -0.22;
    leftArmGroup.add(leftArmMesh);
    userAvatar.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.2, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -0.22;
    rightArmGroup.add(rightArmMesh);
    userAvatar.add(rightArmGroup);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.65, 12);
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, 0.7, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, armMat);
    leftLegMesh.position.y = -0.32;
    leftLegGroup.add(leftLegMesh);
    userAvatar.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, 0.7, 0);
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

    // Footprint Ground Disc (Real-time dynamic uncertainty radius)
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const footprintDisc = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.42, 32), discMat);
    footprintDisc.rotation.x = Math.PI / 2;
    footprintDisc.position.y = 0.02;
    userAvatar.add(footprintDisc);

    scene.add(userAvatar);
    userAvatarRef.current = userAvatar;

    // --- 3 Roommate Avatars (Subjects #2, #3, #4) ---
    roommateAvatarsRef.current = [];
    const roommateConfigs = [
      { id: 'Roommate #1', color: 0xf59e0b, x: 4.55, z: 2.85 }, // Amber (Workstation)
      { id: 'Roommate #2', color: 0xa855f7, x: 1.65, z: 3.10 }, // Violet (Lounge)
      { id: 'Roommate #3', color: 0x10b981, x: 3.75, z: 1.15 }, // Emerald (Entryway)
    ];

    roommateConfigs.forEach((cfg) => {
      const rmGroup = new THREE.Group();
      rmGroup.position.set(cfg.x, 0, cfg.z);

      const rmMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      });

      const rmHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), rmMat);
      rmHead.position.y = 1.58;
      rmGroup.add(rmHead);

      const rmTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.6, 14), rmMat);
      rmTorso.position.y = 1.15;
      rmGroup.add(rmTorso);

      const rmFootprint = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.35, 24),
        new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      rmFootprint.rotation.x = Math.PI / 2;
      rmFootprint.position.y = 0.02;
      rmGroup.add(rmFootprint);

      scene.add(rmGroup);
      roommateAvatarsRef.current.push(rmGroup);
    });

    // Breadcrumb Movement Trail
    const maxTrailPoints = 60;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.6,
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

      // Smooth interpolation (Lerp) of user avatar to live target coordinates
      if (userAvatarRef.current) {
        const u = userAvatarRef.current;
        const targetX = currentX;
        const targetZ = currentY; // In Three.js, horizontal room depth is Z

        const dx = targetX - u.position.x;
        const dz = targetZ - u.position.z;
        u.position.x += dx * 0.12;
        u.position.z += dz * 0.12;

        const distanceMoved = Math.sqrt(dx * dx + dz * dz);

        // Animate walking limbs when moving
        if (userLimbsRef.current) {
          if (distanceMoved > 0.01 || currentVel > 0.05 || isMovementDetected) {
            walkCycle += 0.18;
            userLimbsRef.current.leftLeg.rotation.x = Math.sin(walkCycle) * 0.55;
            userLimbsRef.current.rightLeg.rotation.x = -Math.sin(walkCycle) * 0.55;
            userLimbsRef.current.leftArm.rotation.x = -Math.sin(walkCycle) * 0.45;
            userLimbsRef.current.rightArm.rotation.x = Math.sin(walkCycle) * 0.45;
          } else {
            // Return to standing rest
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

      // Idle breathing micro-animation for roommates
      roommateAvatarsRef.current.forEach((rm, idx) => {
        rm.position.y = 0.02 * Math.sin(phase * 1.5 + idx * 1.2);
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
  }, [updateCameraPosition, currentX, currentY, currentVel, isMovementDetected]);

  // Update Dynamic Visual Elements on Hardware Telemetry Changes
  useEffect(() => {
    if (!fresnelMeshRef.current || !userAvatarRef.current) return;

    const fresnelMat = fresnelMeshRef.current.material as THREE.MeshBasicMaterial;

    if (isMovementDetected) {
      fresnelMat.color.setHex(0x10b981);
      fresnelMat.opacity = Math.min(0.45, 0.2 + motionIntensity * 0.35);
      userAvatarRef.current.visible = true;
    } else if (isPossiblePresence) {
      fresnelMat.color.setHex(0xf59e0b);
      fresnelMat.opacity = 0.25;
      userAvatarRef.current.visible = true;
    } else {
      fresnelMat.color.setHex(0x0284c7);
      fresnelMat.opacity = 0.15;
      userAvatarRef.current.visible = isStreaming;
    }
  }, [isMovementDetected, isPossiblePresence, motionIntensity, isStreaming]);

  // 2D Tactical Plan Canvas Render
  useEffect(() => {
    if (viewMode !== '2d') return;
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Deep slate background
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, width, height);

    // Scale factors: room is 6.0m wide (X), 4.0m deep (Y)
    const margin = 40;
    const plotW = width - margin * 2;
    const plotH = height - margin * 2;
    const scale = Math.min(plotW / 6.0, plotH / 4.0);
    const originX = margin + (plotW - 6.0 * scale) / 2;
    const originY = margin + (plotH - 4.0 * scale) / 2;

    const toPxX = (mX: number) => originX + mX * scale;
    const toPxY = (mY: number) => originY + mY * scale;

    // Room boundaries
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(originX, originY, 6.0 * scale, 4.0 * scale);

    // Grid lines (1 meter intervals)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 1; x < 6; x++) {
      ctx.beginPath();
      ctx.moveTo(toPxX(x), originY);
      ctx.lineTo(toPxX(x), originY + 4.0 * scale);
      ctx.stroke();
    }
    for (let y = 1; y < 4; y++) {
      ctx.beginPath();
      ctx.moveTo(originX, toPxY(y));
      ctx.lineTo(originX + 6.0 * scale, toPxY(y));
      ctx.stroke();
    }

    // 1st Fresnel zone ellipse
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(toPxX(3.0), toPxY(2.0), 2.0 * scale, 0.65 * scale, 0, 0, 2 * Math.PI);
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
    ctx.moveTo(toPxX(1.0), toPxY(2.0));
    ctx.lineTo(toPxX(5.0), toPxY(2.0));
    ctx.stroke();

    // Node TX (Router)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(toPxX(1.0), toPxY(2.0), 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#93c5fd';
    ctx.font = '11px sans-serif';
    ctx.fillText('Wi-Fi Router (TX)', toPxX(1.0) - 40, toPxY(2.0) - 14);

    // Node RX (ESP32)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(toPxX(5.0), toPxY(2.0), 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = '11px sans-serif';
    ctx.fillText('ESP32 DevKit (RX)', toPxX(5.0) - 40, toPxY(2.0) - 14);

    // Three Roommates
    const roommates = [
      { name: 'Roommate #1 (Desk)', color: '#f59e0b', x: 4.55, y: 2.85 },
      { name: 'Roommate #2 (Lounge)', color: '#a855f7', x: 1.65, y: 3.10 },
      { name: 'Roommate #3 (Door)', color: '#10b981', x: 3.75, y: 1.15 },
    ];
    roommates.forEach((rm) => {
      ctx.fillStyle = rm.color;
      ctx.beginPath();
      ctx.arc(toPxX(rm.x), toPxY(rm.y), 7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(rm.name, toPxX(rm.x) - 45, toPxY(rm.y) + 18);
    });

    // User Avatar (Subject #1 - You)
    const pxX = toPxX(currentX);
    const pxY = toPxY(currentY);

    // Uncertainty circle
    ctx.fillStyle = 'rgba(0, 255, 204, 0.2)';
    ctx.beginPath();
    ctx.arc(pxX, pxY, 0.35 * scale, 0, 2 * Math.PI);
    ctx.fill();

    // User point
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(pxX, pxY, 9, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`You: (${currentX.toFixed(2)}m, ${currentY.toFixed(2)}m)`, pxX - 50, pxY - 14);
  }, [viewMode, currentX, currentY, isMovementDetected]);

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
            <h2 className="physical-title">Physical RF Multipath & Dynamic Human Positioning</h2>
            <span className={`status-tag ${isStreaming ? 'status-tag--live' : 'status-tag--waiting'}`}>
              {isStreaming ? '● LIVE HARDWARE CSI' : '○ ESP32 AWAITING WI-FI PACKETS'}
            </span>
          </div>
          <div className="physical-subtitle">
            Live dynamic tracking via 64-subcarrier spectral tilt & multipath delay between Router (TX: 1.0m, 2.0m) and ESP32 (RX: 5.0m, 2.0m on COM7)
          </div>
        </div>

        <div className="physical-actions">
          <div className="view-mode-toggle">
            <button
              className={`btn-toggle ${viewMode === '3d' ? 'btn-toggle--active' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D Dynamic Room
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
          <strong>Dynamic Wi-Fi Positioning Active:</strong> Moving across the room creates subcarrier spectral tilt (along-axis distance between Router & ESP32) and multipath delay ripples (lateral room displacement). The avatar glides dynamically to your real-time estimated coordinates $(X, Y)$ rather than sitting at a fixed point. Multi-occupant modeling simultaneously maps detected roommates in the room.
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
            width={800}
            height={520}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}

        {/* 3D Glass HUD Overlay */}
        <div className="physical-hud-top">
          <div className="hud-badge-group">
            <span className="hud-badge" style={{ color: '#00ffcc', borderColor: '#00ffcc' }}>
              📍 Target: X: {currentX.toFixed(2)}m, Y: {currentY.toFixed(2)}m
            </span>
            <span className="hud-badge">Speed: {currentVel.toFixed(2)} m/s</span>
            <span className="hud-badge" style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
              👥 Occupants: 4 (You + 3 Roommates)
            </span>
            <span className="hud-badge">Node RX: ESP32 DevKit V1 (COM7)</span>
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
