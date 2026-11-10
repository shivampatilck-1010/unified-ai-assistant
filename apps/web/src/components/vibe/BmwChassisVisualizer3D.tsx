import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './BmwChassisVisualizer3D.css';

export interface BmwChassisVisualizer3DProps {
  title?: string;
  initialMode?: 'skeleton' | 'torque' | 'balance' | 'exploded';
}

// Gear ratios for ZF 8HP automatic transmission
const GEAR_RATIOS: Record<string, number> = {
  P: 0,
  R: -3.3,
  N: 0,
  '1': 5.0,
  '2': 3.2,
  '3': 2.14,
  '4': 1.72,
  '5': 1.31,
  '6': 1.0,
  '7': 0.82,
  '8': 0.64,
};

// Cylinder firing order for BMW Inline-6: 1-5-3-6-2-4
const FIRING_ORDER_PHASES = [
  0,                  // Cyl 1: 0°
  (4 * Math.PI) / 3,  // Cyl 2: 240°
  (2 * Math.PI) / 3,  // Cyl 3: 120°
  (5 * Math.PI) / 3,  // Cyl 4: 300°
  Math.PI / 3,        // Cyl 5: 60°
  Math.PI,            // Cyl 6: 180°
];

export const BmwChassisVisualizer3D: React.FC<BmwChassisVisualizer3DProps> = ({
  title = 'BMW Longitudinal Chassis & Powertrain Architecture (CLAR)',
  initialMode = 'skeleton',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Simulation State
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [mode, setMode] = useState<'skeleton' | 'torque' | 'balance' | 'exploded'>(initialMode);
  const [rpm, setRpm] = useState<number>(3200);
  const [gear, setGear] = useState<string>('3');
  const [activePreset, setActivePreset] = useState<string>('iso');

  // References for Animation Loop
  const rpmRef = useRef(rpm);
  rpmRef.current = rpm;
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Animated Component Object References
  const movingPartsRef = useRef<{
    pistons: THREE.Mesh[];
    crankshaft: THREE.Group;
    driveshaft: THREE.Group;
    rearHalfShafts: THREE.Group[];
    wheels: THREE.Group[];
    turboRotor: THREE.Mesh | null;
    torqueParticles: THREE.Points | null;
    torqueParticlePositions: Float32Array | null;
    balancePlane: THREE.Mesh | null;
    chassisGroup: THREE.Group | null;
    engineGroup: THREE.Group | null;
    transmissionGroup: THREE.Group | null;
  }>({
    pistons: [],
    crankshaft: new THREE.Group(),
    driveshaft: new THREE.Group(),
    rearHalfShafts: [],
    wheels: [],
    turboRotor: null,
    torqueParticles: null,
    torqueParticlePositions: null,
    balancePlane: null,
    chassisGroup: null,
    engineGroup: null,
    transmissionGroup: null,
  });

  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Real-time calculated telemetry
  const telemetry = useMemo(() => {
    const ratio = GEAR_RATIOS[gear] || 0;
    const finalDriveRatio = 3.15; // Typical BMW M differential ratio
    const wheelCircumferenceMeters = 2.05; // 275/35 R19 tire

    if (ratio === 0 || !isRunning) {
      return { speedKmh: 0, speedMph: 0, torqueNm: Math.round(500 * (rpm / 5000)), driveshaftRpm: 0 };
    }

    const driveshaftRpm = Math.round(rpm / Math.abs(ratio));
    const wheelRpm = driveshaftRpm / finalDriveRatio;
    const speedKmh = Math.round((wheelRpm * 60 * wheelCircumferenceMeters) / 1000);
    const speedMph = Math.round(speedKmh * 0.621371);
    const torqueNm = Math.round(Math.min(550, 250 + (rpm / 3500) * 300));

    return { speedKmh, speedMph, torqueNm, driveshaftRpm };
  }, [rpm, gear, isRunning]);

  // Camera presets
  const applyPreset = useCallback((preset: 'iso' | 'top' | 'side' | 'engine') => {
    setActivePreset(preset);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (preset === 'iso') {
      camera.position.set(7.5, 4.8, 8.5);
      controls.target.set(0, 0, 0);
    } else if (preset === 'top') {
      camera.position.set(0, 11, 0.1);
      controls.target.set(0, 0, 0);
    } else if (preset === 'side') {
      camera.position.set(10.5, 1.2, 0);
      controls.target.set(0, 0, 0);
    } else if (preset === 'engine') {
      camera.position.set(2.8, 2.5, -2.2);
      controls.target.set(0, 0.4, -1.8);
    }
    controls.update();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // 1. Scene, Camera & Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06080d, 0.025);

    const width = mount.clientWidth || 700;
    const height = mount.clientHeight || 440;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(7.5, 4.8, 8.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    // 2. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below floor
    controls.minDistance = 3;
    controls.maxDistance = 22;
    controlsRef.current = controls;

    // 3. Lighting (Studio Dark Showcase)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    keyLight.position.set(6, 8, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.5);
    rimLight.position.set(-6, 6, -5);
    scene.add(rimLight);

    const groundGlow = new THREE.DirectionalLight(0x10b981, 0.6);
    groundGlow.position.set(0, -4, 0);
    scene.add(groundGlow);

    // 4. Ground Grid & Axle Reference Guides
    const gridHelper = new THREE.GridHelper(18, 36, 0x38bdf8, 0x1f293d);
    gridHelper.position.y = -0.92;
    scene.add(gridHelper);

    // Materials Library
    const matChassis = new THREE.MeshStandardMaterial({
      color: 0x272e3f,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const matEngineBlock = new THREE.MeshStandardMaterial({
      color: 0x3b4252,
      metalness: 0.85,
      roughness: 0.25,
    });
    const matPiston = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xd97706,
      emissiveIntensity: 0.3,
    });
    const matTransmission = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.7,
      roughness: 0.3,
    });
    const matDriveshaft = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
    });
    const matDifferential = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x059669,
      emissiveIntensity: 0.2,
    });
    const matWheelTire = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.1,
    });
    const matWheelRim = new THREE.MeshStandardMaterial({
      color: 0xe4e4e7,
      metalness: 0.95,
      roughness: 0.1,
    });
    const matBrakeCaliper = new THREE.MeshStandardMaterial({
      color: 0x2563eb, // BMW M-Sport Blue
      metalness: 0.6,
      roughness: 0.2,
    });
    const matBrakeRotor = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      metalness: 0.95,
      roughness: 0.3,
    });

    // 5. Build Chassis Monocoque (CLAR Architecture Outline)
    const chassisGroup = new THREE.Group();
    scene.add(chassisGroup);
    movingPartsRef.current.chassisGroup = chassisGroup;

    // Outer Body Skeleton Shell
    const shellCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.4, -4.2),  // Front Bumper
      new THREE.Vector3(0, 0.9, -2.6),  // Front Hood
      new THREE.Vector3(0, 1.45, -0.9), // Windshield Base
      new THREE.Vector3(0, 1.55, 0.8),  // Roofline
      new THREE.Vector3(0, 1.25, 2.4),  // Rear Glass
      new THREE.Vector3(0, 0.8, 3.8),   // Trunk Lid
      new THREE.Vector3(0, 0.4, 4.3),   // Rear Bumper
    ]);
    const shellGeo = new THREE.TubeGeometry(shellCurve, 64, 0.04, 8, false);
    const spineMesh = new THREE.Mesh(shellGeo, matChassis);
    chassisGroup.add(spineMesh);

    // Side Sills & Wheel Arches Outline
    const createSideFrame = (sign: number) => {
      const sideGroup = new THREE.Group();
      // Outer sill
      const sillGeo = new THREE.BoxGeometry(0.08, 0.15, 6.8);
      const sill = new THREE.Mesh(sillGeo, matChassis);
      sill.position.set(sign * 1.5, -0.2, 0.1);
      sideGroup.add(sill);

      // Front Strut Tower
      const towerGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.9, 12);
      const tower = new THREE.Mesh(towerGeo, matChassis);
      tower.position.set(sign * 1.15, 0.35, -2.2);
      sideGroup.add(tower);

      // Carbon Core Roof Rail
      const railGeo = new THREE.BoxGeometry(0.06, 0.08, 3.2);
      const rail = new THREE.Mesh(railGeo, matChassis);
      rail.position.set(sign * 1.1, 1.45, 0.6);
      sideGroup.add(rail);

      return sideGroup;
    };
    chassisGroup.add(createSideFrame(1));
    chassisGroup.add(createSideFrame(-1));

    // Front Axle Reference Line (Laser Wire)
    const frontAxleMarkerGeo = new THREE.CylinderGeometry(0.015, 0.015, 3.6, 8);
    const frontAxleMarkerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
    const frontAxleMarker = new THREE.Mesh(frontAxleMarkerGeo, frontAxleMarkerMat);
    frontAxleMarker.rotation.z = Math.PI / 2;
    frontAxleMarker.position.set(0, -0.5, -2.2);
    scene.add(frontAxleMarker);

    // Rear Axle Reference Line (Laser Wire)
    const rearAxleMarker = frontAxleMarker.clone();
    rearAxleMarker.position.set(0, -0.5, 2.4);
    scene.add(rearAxleMarker);

    // 6. BUILD ENGINE: BMW B58 3.0L INLINE-6 (Longitudinally Mounted Front-Mid)
    const engineGroup = new THREE.Group();
    // CRITICAL: Placed strictly BEHIND front axle line (-2.2) at Z = -1.1 to -2.0!
    engineGroup.position.set(0, 0.25, -1.35);
    scene.add(engineGroup);
    movingPartsRef.current.engineGroup = engineGroup;

    // Engine Block (Tilted 30° toward passenger side — Classic BMW Slant)
    const engineBlockGeo = new THREE.BoxGeometry(0.75, 0.7, 1.6);
    const engineBlock = new THREE.Mesh(engineBlockGeo, matEngineBlock);
    engineBlock.rotation.z = -0.15; // 30-degree subtle tilt
    engineGroup.add(engineBlock);

    // Valve Cover with M Carbon Inlay
    const valveCoverGeo = new THREE.BoxGeometry(0.7, 0.16, 1.55);
    const valveCoverMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.2,
      metalness: 0.8,
    });
    const valveCover = new THREE.Mesh(valveCoverGeo, valveCoverMat);
    valveCover.position.set(0, 0.42, 0);
    valveCover.rotation.z = -0.15;
    engineGroup.add(valveCover);

    // 6 In-Line Cylinders & Reciprocating Pistons
    const pistons: THREE.Mesh[] = [];
    for (let c = 0; c < 6; c++) {
      const zOffset = -0.6 + c * 0.24;

      // Cylinder Bore Chamber
      const boreGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.35, 16);
      const boreMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, wireframe: true });
      const bore = new THREE.Mesh(boreGeo, boreMat);
      bore.position.set(0, 0.12, zOffset);
      engineGroup.add(bore);

      // Reciprocating Piston Head
      const pistonGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.08, 16);
      const piston = new THREE.Mesh(pistonGeo, matPiston);
      piston.position.set(0, 0.12, zOffset);
      engineGroup.add(piston);
      pistons.push(piston);
    }
    movingPartsRef.current.pistons = pistons;

    // Twin-Scroll Turbocharger & Manifold
    const turboHousingGeo = new THREE.TorusGeometry(0.18, 0.07, 12, 24);
    const turboMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8, emissive: 0x991b1b, emissiveIntensity: 0.4 });
    const turbo = new THREE.Mesh(turboHousingGeo, turboMat);
    turbo.position.set(0.5, 0.1, -0.1);
    turbo.rotation.y = Math.PI / 2;
    engineGroup.add(turbo);

    // 7. BUILD TRANSMISSION: ZF 8HP 8-SPEED STEPTRONIC
    const transmissionGroup = new THREE.Group();
    // Bolted directly behind engine
    transmissionGroup.position.set(0, 0.1, -0.15);
    scene.add(transmissionGroup);
    movingPartsRef.current.transmissionGroup = transmissionGroup;

    // Bellhousing (Torque Converter Cone)
    const bellhousingGeo = new THREE.CylinderGeometry(0.36, 0.48, 0.45, 20);
    const bellhousing = new THREE.Mesh(bellhousingGeo, matTransmission);
    bellhousing.rotation.x = Math.PI / 2;
    bellhousing.position.set(0, 0, -0.22);
    transmissionGroup.add(bellhousing);

    // Gearbox Main Casing (Houses 4 planetary sets)
    const gearboxGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.85, 20);
    const gearbox = new THREE.Mesh(gearboxGeo, matTransmission);
    gearbox.rotation.x = Math.PI / 2;
    gearbox.position.set(0, 0, 0.42);
    transmissionGroup.add(gearbox);

    // 8. BUILD PROPELLER SHAFT (DRIVESHAFT)
    const driveshaftGroup = new THREE.Group();
    driveshaftGroup.position.set(0, -0.05, 0.85);
    scene.add(driveshaftGroup);
    movingPartsRef.current.driveshaft = driveshaftGroup;

    // 2-Piece Balanced Shaft Tube
    const shaftGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.9, 16);
    const shaft = new THREE.Mesh(shaftGeo, matDriveshaft);
    shaft.rotation.x = Math.PI / 2;
    driveshaftGroup.add(shaft);

    // Center Support Bearing & Guibo Flex Disc
    const centerBearingGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16);
    const centerBearingMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.8 });
    const centerBearing = new THREE.Mesh(centerBearingGeo, centerBearingMat);
    centerBearing.position.set(0, 0, 0);
    centerBearing.rotation.x = Math.PI / 2;
    driveshaftGroup.add(centerBearing);

    // 9. BUILD REAR DIFFERENTIAL (M Active Limited-Slip GHAS)
    const diffGroup = new THREE.Group();
    diffGroup.position.set(0, -0.12, 2.4);
    scene.add(diffGroup);

    // Hypoid Differential Pumpkin Housing
    const diffGeo = new THREE.SphereGeometry(0.32, 24, 24);
    const diff = new THREE.Mesh(diffGeo, matDifferential);
    diff.scale.set(1.1, 0.9, 1.2);
    diffGroup.add(diff);

    // Transverse Rear Axle Half-Shafts
    const halfShafts: THREE.Group[] = [];
    [-1, 1].forEach((side) => {
      const halfShaftGroup = new THREE.Group();
      const halfShaftGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.05, 12);
      const halfShaft = new THREE.Mesh(halfShaftGeo, matDriveshaft);
      halfShaft.rotation.z = (side * Math.PI) / 2;
      halfShaft.position.set(side * 0.65, 0, 0);
      halfShaftGroup.add(halfShaft);
      diffGroup.add(halfShaftGroup);
      halfShafts.push(halfShaftGroup);
    });
    movingPartsRef.current.rearHalfShafts = halfShafts;

    // 10. BUILD 4 WHEELS, BRAKES & SUSPENSION
    const wheels: THREE.Group[] = [];
    const wheelPositions = [
      { x: -1.35, y: -0.35, z: -2.2, isFront: true },  // Front Left
      { x: 1.35, y: -0.35, z: -2.2, isFront: true },   // Front Right
      { x: -1.35, y: -0.35, z: 2.4, isFront: false },  // Rear Left
      { x: 1.35, y: -0.35, z: 2.4, isFront: false },   // Rear Right
    ];

    wheelPositions.forEach((pos) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(pos.x, pos.y, pos.z);
      scene.add(wheelGroup);

      // Tire Tread
      const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 32);
      const tire = new THREE.Mesh(tireGeo, matWheelTire);
      tire.rotation.z = Math.PI / 2;
      wheelGroup.add(tire);

      // Alloy Rim Spokes
      const rimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.35, 16);
      const rim = new THREE.Mesh(rimGeo, matWheelRim);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      // Ventilated Brake Rotor
      const rotorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24);
      const rotor = new THREE.Mesh(rotorGeo, matBrakeRotor);
      rotor.rotation.z = Math.PI / 2;
      rotor.position.set(pos.x > 0 ? -0.1 : 0.1, 0, 0);
      wheelGroup.add(rotor);

      // M-Sport Caliper (Stationary to Hub)
      const caliperGeo = new THREE.BoxGeometry(0.08, 0.18, 0.14);
      const caliper = new THREE.Mesh(caliperGeo, matBrakeCaliper);
      caliper.position.set(pos.x > 0 ? -0.12 : 0.12, 0.18, 0);
      scene.add(caliper); // Don't rotate with wheel

      wheels.push(wheelGroup);
    });
    movingPartsRef.current.wheels = wheels;

    // 11. 50:50 Dynamic Weight Distribution Balance Plane
    const balancePlaneGeo = new THREE.PlaneGeometry(3.6, 7.8);
    const balancePlaneMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const balancePlane = new THREE.Mesh(balancePlaneGeo, balancePlaneMat);
    balancePlane.rotation.x = Math.PI / 2;
    balancePlane.position.set(0, -0.4, 0.1);
    balancePlane.visible = false;
    scene.add(balancePlane);
    movingPartsRef.current.balancePlane = balancePlane;

    // Center of Gravity (CoG) Vector Sphere
    const cogGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const cogMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.8,
    });
    const cogMesh = new THREE.Mesh(cogGeo, cogMat);
    cogMesh.position.set(0, 0.15, 0.1); // Exact center of wheelbase!
    balancePlane.add(cogMesh);

    // 12. Torque Flow Glowing Particles (Kinetic Stream)
    const particleCount = 220;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleGeo = new THREE.BufferGeometry();

    for (let p = 0; p < particleCount; p++) {
      const progress = p / particleCount; // 0 (engine) to 1 (rear wheels)
      const z = -1.6 + progress * 4.0;
      particlePositions[p * 3] = (Math.random() - 0.5) * 0.15;
      particlePositions[p * 3 + 1] = -0.05 + (Math.random() - 0.5) * 0.1;
      particlePositions[p * 3 + 2] = z;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.08,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const torqueParticles = new THREE.Points(particleGeo, particleMat);
    torqueParticles.visible = false;
    scene.add(torqueParticles);

    movingPartsRef.current.torqueParticles = torqueParticles;
    movingPartsRef.current.torqueParticlePositions = particlePositions;

    // 13. High-Performance Render Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      const currentMode = modeRef.current;
      const currentRpm = rpmRef.current;
      const currentGear = gearRef.current;
      const isRunningNow = isRunningRef.current;

      // Handle Exploded View transition
      const parts = movingPartsRef.current;
      if (parts.chassisGroup && parts.engineGroup && parts.transmissionGroup) {
        const targetChassisY = currentMode === 'exploded' ? 1.6 : 0;
        const targetEngineZ = currentMode === 'exploded' ? -2.2 : -1.35;
        const targetTransZ = currentMode === 'exploded' ? 0.35 : -0.15;

        parts.chassisGroup.position.y += (targetChassisY - parts.chassisGroup.position.y) * 0.08;
        parts.engineGroup.position.z += (targetEngineZ - parts.engineGroup.position.z) * 0.08;
        parts.transmissionGroup.position.z += (targetTransZ - parts.transmissionGroup.position.z) * 0.08;
      }

      // Handle Visibility of Mode Layers
      if (parts.balancePlane) {
        parts.balancePlane.visible = currentMode === 'balance';
      }
      if (parts.torqueParticles) {
        parts.torqueParticles.visible = currentMode === 'torque';
      }

      // Mechanical Rotation & Kinematics
      if (isRunningNow) {
        const engineRadsPerSec = (currentRpm / 60) * Math.PI * 2;
        const ratio = GEAR_RATIOS[currentGear] || 0;
        const shaftRadsPerSec = ratio !== 0 ? engineRadsPerSec / Math.abs(ratio) : 0;
        const wheelRadsPerSec = shaftRadsPerSec / 3.15;

        // 1. Reciprocating Pistons (Firing Order 1-5-3-6-2-4)
        parts.pistons.forEach((piston, idx) => {
          const phase = FIRING_ORDER_PHASES[idx];
          const stroke = Math.sin(time * (currentRpm / 120) + phase) * 0.09;
          piston.position.y = 0.12 + stroke;
        });

        // 2. Rotating Driveshaft
        if (parts.driveshaft) {
          parts.driveshaft.rotation.z += shaftRadsPerSec * delta * 0.3;
        }

        // 3. Rotating Rear Half-Shafts
        parts.rearHalfShafts.forEach((halfShaft) => {
          halfShaft.rotation.x += wheelRadsPerSec * delta * 0.3;
        });

        // 4. Rotating Wheels
        parts.wheels.forEach((wheel) => {
          wheel.rotation.x += wheelRadsPerSec * delta * 0.3;
        });

        // 5. Kinetic Torque Stream Flow
        if (currentMode === 'torque' && parts.torqueParticlePositions && parts.torqueParticles) {
          const positions = parts.torqueParticlePositions;
          const streamSpeed = delta * 2.8 * (currentRpm / 3000);

          for (let p = 0; p < particleCount; p++) {
            let z = positions[p * 3 + 2] + streamSpeed;
            if (z > 2.5) {
              z = -1.6; // Loop back to engine
            }
            positions[p * 3 + 2] = z;
          }
          parts.torqueParticles.geometry.attributes.position.needsUpdate = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 14. Responsive Resize Observer
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="bmw-3d-card" title={title}>
      {/* Header Telemetry Bar */}
      <div className="bmw-3d-header">
        <div className="bmw-3d-header__title-group">
          <span className="bmw-3d-badge">3D DIGITAL TWIN</span>
          <span className="bmw-3d-title">BMW Longitudinal Chassis Architecture</span>
          <span className="bmw-3d-subtitle">CLAR Monocoque • RWD • Near 50:50 Mass Equilibrium</span>
        </div>

        <div className="bmw-3d-header__actions">
          <button
            type="button"
            className={`bmw-3d-btn ${mode === 'skeleton' ? 'bmw-3d-btn--active' : ''}`}
            onClick={() => setMode('skeleton')}
          >
            Skeleton
          </button>
          <button
            type="button"
            className={`bmw-3d-btn ${mode === 'torque' ? 'bmw-3d-btn--active' : ''}`}
            onClick={() => setMode('torque')}
          >
            ⚡ Torque Flow
          </button>
          <button
            type="button"
            className={`bmw-3d-btn ${mode === 'balance' ? 'bmw-3d-btn--active' : ''}`}
            onClick={() => setMode('balance')}
          >
            ⚖️ 50:50 Balance
          </button>
          <button
            type="button"
            className={`bmw-3d-btn ${mode === 'exploded' ? 'bmw-3d-btn--active' : ''}`}
            onClick={() => setMode('exploded')}
          >
            Exploded
          </button>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="bmw-3d-viewport" ref={mountRef}>
        {/* Floating Telemetry HUD (Top-Left) */}
        <div className="bmw-3d-hud-top-left">
          <div className="bmw-3d-hud-card">
            <span className="bmw-3d-hud-label">Vehicle Velocity</span>
            <span className="bmw-3d-hud-val">
              {telemetry.speedKmh} <span style={{ fontSize: '10.5px', color: '#71717a' }}>km/h ({telemetry.speedMph} mph)</span>
            </span>
          </div>

          <div className="bmw-3d-hud-card">
            <span className="bmw-3d-hud-label">Powertrain Torque</span>
            <span className="bmw-3d-hud-val" style={{ color: '#38bdf8' }}>
              {telemetry.torqueNm} <span style={{ fontSize: '10.5px', color: '#71717a' }}>Nm @ {rpm} RPM</span>
            </span>
          </div>
        </div>

        {/* Top-Right Ignition Toggle */}
        <div className="bmw-3d-hud-top-right">
          <button
            type="button"
            className={`bmw-3d-btn ${isRunning ? 'bmw-3d-btn--active' : ''}`}
            onClick={() => setIsRunning(!isRunning)}
            style={{ pointerEvents: 'auto' }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isRunning ? '#10b981' : '#71717a',
                display: 'inline-block',
                boxShadow: isRunning ? '0 0 6px #10b981' : 'none',
              }}
            />
            {isRunning ? 'ENGINE ACTIVE' : 'ENGINE OFF'}
          </button>
        </div>

        {/* Camera Angle Presets (Bottom Center) */}
        <div className="bmw-3d-presets-tray">
          <button
            type="button"
            className={`bmw-3d-preset-pill ${activePreset === 'iso' ? 'bmw-3d-preset-pill--active' : ''}`}
            onClick={() => applyPreset('iso')}
          >
            Isometric
          </button>
          <button
            type="button"
            className={`bmw-3d-preset-pill ${activePreset === 'top' ? 'bmw-3d-preset-pill--active' : ''}`}
            onClick={() => applyPreset('top')}
          >
            Chassis Plan
          </button>
          <button
            type="button"
            className={`bmw-3d-preset-pill ${activePreset === 'side' ? 'bmw-3d-preset-pill--active' : ''}`}
            onClick={() => applyPreset('side')}
          >
            Longitudinal Profile
          </button>
          <button
            type="button"
            className={`bmw-3d-preset-pill ${activePreset === 'engine' ? 'bmw-3d-preset-pill--active' : ''}`}
            onClick={() => applyPreset('engine')}
          >
            B58 Engine Zoom
          </button>
        </div>
      </div>

      {/* Interactive Controls & Telemetry Dashboard */}
      <div className="bmw-3d-dashboard">
        {/* 1. Engine RPM Controller */}
        <div className="bmw-3d-control-group">
          <div className="bmw-3d-control-header">
            <span className="bmw-3d-hud-label">B58 Inline-6 Engine Throttle</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#38bdf8', fontWeight: 600 }}>
              {rpm} RPM
            </span>
          </div>
          <div className="bmw-3d-slider-wrap">
            <input
              type="range"
              min="800"
              max="7200"
              step="100"
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              className="bmw-3d-slider"
              disabled={!isRunning}
            />
          </div>
        </div>

        {/* 2. ZF 8-Speed Steptronic Gearbox */}
        <div className="bmw-3d-control-group">
          <div className="bmw-3d-control-header">
            <span className="bmw-3d-hud-label">ZF 8HP Gear Ratio</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#a1a1aa' }}>
              Ratio: {GEAR_RATIOS[gear] || 0}:1
            </span>
          </div>
          <div className="bmw-3d-gears">
            {['P', 'R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'].map((g) => (
              <button
                key={g}
                type="button"
                className={`bmw-3d-gear-btn ${gear === g ? 'bmw-3d-gear-btn--active' : ''}`}
                onClick={() => setGear(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Static Mass Balance (50.0% Front / 50.0% Rear) */}
        <div className="bmw-3d-control-group">
          <div className="bmw-3d-control-header">
            <span className="bmw-3d-hud-label">Weight Distribution</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#10b981', fontWeight: 700 }}>
              50.0% : 50.0%
            </span>
          </div>
          <div className="bmw-3d-balance-bar">
            <div className="bmw-3d-balance-needle" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#71717a', marginTop: 3 }}>
            <span>FRONT AXLE (780 KG)</span>
            <span>REAR AXLE (780 KG)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
