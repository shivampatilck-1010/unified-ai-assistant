import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AtomPreset } from './UniversalDiagramCard';

interface AtomViewer3DProps {
  atom: AtomPreset;
  animate?: boolean;
  showLabels?: boolean;
}

export const AtomViewer3D: React.FC<AtomViewer3DProps> = ({
  atom,
  animate = true,
  showLabels = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 660;
    const height = container.clientHeight || 460;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#121110');

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.2, 8.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 22;

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    dirLight.position.set(6, 10, 8);
    scene.add(dirLight);

    const nucleusLight = new THREE.PointLight(0xf97316, 2.0, 10);
    nucleusLight.position.set(0, 0, 0);
    scene.add(nucleusLight);

    // 4. Nucleus Group (Protons & Neutrons packed tightly)
    const nucleusGroup = new THREE.Group();
    scene.add(nucleusGroup);

    const totalNucleons = Math.min(atom.a, 70); // clamp dense cluster for high atomic mass
    const numProtons = Math.min(atom.z, totalNucleons);

    // Nucleon Materials
    const protonMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      metalness: 0.35,
      roughness: 0.25,
      emissive: '#dc2626',
      emissiveIntensity: 0.35,
    });
    const neutronMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.5,
      roughness: 0.4,
    });
    const nucleonGeo = new THREE.SphereGeometry(0.14, 20, 20);

    // Distribute nucleons using Fibonacci spiral sphere packing
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    for (let i = 0; i < totalNucleons; i++) {
      const y = 1 - (i / (totalNucleons - 1 || 1)) * 2; // -1 to 1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const rCluster = 0.22 + Math.cbrt(totalNucleons) * 0.11;
      const x = Math.cos(theta) * radiusAtY * rCluster;
      const z = Math.sin(theta) * radiusAtY * rCluster;
      const finalY = y * rCluster;

      const isProton = i < numProtons;
      const mesh = new THREE.Mesh(nucleonGeo, isProton ? protonMat : neutronMat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.05,
        finalY + (Math.random() - 0.5) * 0.05,
        z + (Math.random() - 0.5) * 0.05
      );
      nucleusGroup.add(mesh);
    }

    // Central Nucleus Aura Sphere (Soft Glow)
    const auraMat = new THREE.MeshBasicMaterial({
      color: '#ea580c',
      transparent: true,
      opacity: 0.16,
      wireframe: false,
    });
    const auraGeo = new THREE.SphereGeometry(0.4 + Math.cbrt(totalNucleons) * 0.12, 24, 24);
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    nucleusGroup.add(auraMesh);

    // 5. Electron Shells & Orbiting Electrons
    const shellRadii = [1.6, 2.65, 3.75, 4.85, 5.85, 6.85];
    const shellTilts = [
      { x: 0.22, y: 0.0, z: 0.0 },
      { x: 0.75, y: 0.52, z: 0.1 },
      { x: -0.62, y: -0.68, z: 0.25 },
      { x: 1.15, y: -0.35, z: 0.4 },
      { x: -0.9, y: 0.8, z: -0.3 },
      { x: 0.4, y: -1.0, z: 0.5 },
    ];

    const electronGeo = new THREE.SphereGeometry(0.095, 20, 20);
    const electronMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      metalness: 0.2,
      roughness: 0.1,
      emissive: '#0284c7',
      emissiveIntensity: 0.8,
    });

    interface OrbitingElectron {
      group: THREE.Group;
      mesh: THREE.Mesh;
      radius: number;
      baseAngle: number;
      speed: number;
    }

    const orbitingElectrons: OrbitingElectron[] = [];

    atom.shells.forEach((electronCount, sIdx) => {
      const r = shellRadii[sIdx] || 1.6 + sIdx * 1.1;
      const tilt = shellTilts[sIdx % shellTilts.length];

      const shellGroup = new THREE.Group();
      shellGroup.rotation.set(tilt.x, tilt.y, tilt.z);
      scene.add(shellGroup);

      // Orbital Guide Ring (Subtle glowing line)
      const ringGeo = new THREE.TorusGeometry(r, 0.014, 16, 120);
      const ringMat = new THREE.MeshBasicMaterial({
        color: sIdx === 2 ? '#d97757' : '#38bdf8',
        transparent: true,
        opacity: 0.38,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      shellGroup.add(ringMesh);

      // Quantum Shell Speed (inner shells orbit faster)
      const speed = 1.6 / Math.pow(sIdx + 1, 0.72);

      for (let eIdx = 0; eIdx < electronCount; eIdx++) {
        const baseAngle = (eIdx / electronCount) * Math.PI * 2;
        const eMesh = new THREE.Mesh(electronGeo, electronMat);

        // Initial Position
        eMesh.position.set(r * Math.cos(baseAngle), 0, r * Math.sin(baseAngle));
        shellGroup.add(eMesh);

        orbitingElectrons.push({
          group: shellGroup,
          mesh: eMesh,
          radius: r,
          baseAngle,
          speed,
        });
      }
    });

    // 6. Animation Loop
    let animId = 0;
    let clock = new THREE.Clock();

    const animateScene = () => {
      animId = requestAnimationFrame(animateScene);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (animate) {
        // Subtle Nucleus rotation & pulsation
        nucleusGroup.rotation.y += delta * 0.45;
        nucleusGroup.rotation.x += delta * 0.2;
        const pulse = 1 + Math.sin(elapsedTime * 2.5) * 0.03;
        auraMesh.scale.set(pulse, pulse, pulse);

        // Orbit Electrons along 3D rings
        orbitingElectrons.forEach((el) => {
          const currentAngle = el.baseAngle + elapsedTime * el.speed;
          el.mesh.position.set(
            el.radius * Math.cos(currentAngle),
            0,
            el.radius * Math.sin(currentAngle)
          );
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animateScene();

    // 7. Responsive Resizing
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 660;
      const newH = container.clientHeight || 460;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      // Clean up geometries and materials
      nucleonGeo.dispose();
      auraGeo.dispose();
      electronGeo.dispose();
      protonMat.dispose();
      neutronMat.dispose();
      auraMat.dispose();
      electronMat.dispose();
    };
  }, [atom, animate, showLabels]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '440px',
          display: 'block',
          cursor: 'grab',
        }}
      />

      {/* Floating 3D Telemetry Overlay Badge */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '16px',
          background: 'rgba(18, 17, 16, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(217, 119, 87, 0.35)',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#ede8df',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#d97757', marginBottom: '2px' }}>
          <span>🪐 3D WebGL Atomic Model</span>
          <span style={{ color: '#737373', fontWeight: 400 }}>•</span>
          <span style={{ color: '#a3a3a3', fontWeight: 500 }}>Drag to rotate • Scroll to zoom</span>
        </div>
        <div>
          Nucleus: <strong style={{ color: '#ef4444' }}>{atom.z} Protons</strong> + <strong style={{ color: '#94a3b8' }}>{atom.a - atom.z} Neutrons</strong> | Electrons: <strong style={{ color: '#38bdf8' }}>{atom.shells.join(' : ')}</strong> ({atom.z} e⁻)
        </div>
      </div>
    </div>
  );
};
