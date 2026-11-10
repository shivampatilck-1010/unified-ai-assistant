import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export interface NeuralThreeOrbProps {
  size?: number;
  className?: string;
  isStreaming?: boolean;
}

export const NeuralThreeOrb: React.FC<NeuralThreeOrbProps> = ({
  size = 110,
  className = '',
  isStreaming = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Three.js scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 2.8;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    // Geometry: Icosahedron wireframe + inner glowing particle field
    const geometry = new THREE.IcosahedronGeometry(0.9, 2);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xD97757, // Unified Terracotta
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, wireframeMaterial);
    scene.add(mesh);

    // Inner core sphere
    const coreGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1, // Indigo highlight
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Particle nodes at vertices
    const pointsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.04,
      transparent: true,
      opacity: 0.9,
    });
    const points = new THREE.Points(geometry, pointsMat);
    scene.add(points);

    // Mouse tracking
    let targetRotX = 0;
    let targetRotY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetRotY = x * 1.5;
      targetRotX = y * 1.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      const speed = isStreamingRef.current ? 2.5 : 1.0;

      // Smooth rotation with mouse tilt
      mesh.rotation.y += 0.008 * speed;
      mesh.rotation.x += 0.004 * speed;
      coreMesh.rotation.y -= 0.012 * speed;

      mesh.rotation.x += (targetRotX - mesh.rotation.x) * 0.05;
      mesh.rotation.y += (targetRotY - mesh.rotation.y) * 0.05;

      // Pulse breathing
      const pulse = 1 + Math.sin(elapsedTime * (isStreamingRef.current ? 6 : 2)) * 0.06;
      mesh.scale.set(pulse, pulse, pulse);

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      coreGeo.dispose();
      wireframeMaterial.dispose();
      coreMat.dispose();
      pointsMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={`neural-three-orb flex items-center justify-center transition-transform hover:scale-105 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      title={isStreaming ? 'Unified AI: Processing...' : 'Unified AI: Neural 3D Core'}
      aria-label="Unified AI 3D Neural Presence"
    />
  );
};
