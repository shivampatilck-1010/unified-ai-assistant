import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { InteractiveModel, InteractiveModelPart } from './interactiveModelSchema';
import './InteractiveModel3D.css';

interface InteractiveModel3DProps {
  model: InteractiveModel;
}

function createGeometry(part: InteractiveModelPart): THREE.BufferGeometry {
  switch (part.shape) {
    case 'ellipsoid':
    case 'sphere':
      return new THREE.SphereGeometry(1, 32, 24);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.5, 1, 6, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.75, 0.75, 1, 32);
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'torus':
      return new THREE.TorusGeometry(0.75, 0.22, 16, 48);
  }
}

export function InteractiveModel3D({ model }: InteractiveModel3DProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const meshByPartRef = useRef(new Map<string, THREE.Mesh>());
  const basePositionsRef = useRef(new Map<string, THREE.Vector3>());
  const controlsRef = useRef<OrbitControls | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string>(model.parts[0]?.id ?? '');
  const [sectionView, setSectionView] = useState(false);
  const [explosion, setExplosion] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const selectedPart = model.parts.find((part) => part.id === selectedPartId) ?? model.parts[0];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let renderer: THREE.WebGLRenderer;
    try {
      const width = Math.max(viewport.clientWidth, 320);
      const height = Math.max(viewport.clientHeight, 360);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#161513');
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(4.5, 3.1, 5.2);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      viewport.replaceChildren(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xfff1de, 0x312c29, 2.1));
      const keyLight = new THREE.DirectionalLight(0xffe6d3, 3);
      keyLight.position.set(4, 6, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9ab8ff, 1.2);
      fillLight.position.set(-5, 2, -4);
      scene.add(fillLight);

      const group = new THREE.Group();
      const meshMap = new Map<string, THREE.Mesh>();
      const basePositions = new Map<string, THREE.Vector3>();
      for (const part of model.parts) {
        const material = new THREE.MeshStandardMaterial({
          color: part.color,
          roughness: 0.4,
          metalness: 0.04,
        });
        const mesh = new THREE.Mesh(createGeometry(part), material);
        mesh.name = part.name;
        mesh.position.set(...part.position);
        mesh.scale.set(...part.scale);
        mesh.userData.partId = part.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        meshMap.set(part.id, mesh);
        basePositions.set(part.id, mesh.position.clone());
      }
      scene.add(group);
      modelGroupRef.current = group;
      meshByPartRef.current = meshMap;
      basePositionsRef.current = basePositions;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 2.5;
      controls.maxDistance = 14;
      controlsRef.current = controls;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerStart: { x: number; y: number } | null = null;
      const handlePointerDown = (event: PointerEvent) => {
        pointerStart = { x: event.clientX, y: event.clientY };
      };
      const handlePointerUp = (event: PointerEvent) => {
        if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
          pointerStart = null;
          return;
        }
        pointerStart = null;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(group.children, false)[0];
        const partId = hit?.object.userData.partId;
        if (typeof partId === 'string') setSelectedPartId(partId);
      };
      renderer.domElement.addEventListener('pointerdown', handlePointerDown);
      renderer.domElement.addEventListener('pointerup', handlePointerUp);

      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = Math.max(viewport.clientWidth, 320);
        const nextHeight = Math.max(viewport.clientHeight, 360);
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      });
      resizeObserver.observe(viewport);

      let animationFrame = 0;
      const render = () => {
        controls.update();
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };
      render();

      return () => {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        controls.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
        modelGroupRef.current = null;
        meshByPartRef.current.clear();
        basePositionsRef.current.clear();
        controlsRef.current = null;
      };
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'WebGL could not initialize in this browser.');
      return;
    }
  }, [model]);

  useEffect(() => {
    const center = model.parts
      .reduce((sum, part) => sum.add(new THREE.Vector3(...part.position)), new THREE.Vector3())
      .multiplyScalar(1 / model.parts.length);

    for (const part of model.parts) {
      const mesh = meshByPartRef.current.get(part.id);
      if (!mesh) continue;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isOuter = /^(outer|surface|shell)$/i.test(part.layer);
      material.transparent = sectionView && isOuter;
      material.opacity = sectionView && isOuter ? 0.18 : 1;
      material.depthWrite = !(sectionView && isOuter);
      material.emissive.set(part.id === selectedPartId ? '#66412c' : '#000000');
      material.emissiveIntensity = part.id === selectedPartId ? 0.7 : 0;
      material.needsUpdate = true;

      const base = basePositionsRef.current.get(part.id);
      if (base) {
        const direction = base.clone().sub(center);
        mesh.position.copy(base).addScaledVector(direction, explosion * 0.75);
      }
    }
  }, [explosion, model, sectionView, selectedPartId]);

  const handleResetView = useCallback(() => {
    controlsRef.current?.reset();
    setExplosion(0);
    setSectionView(false);
  }, []);

  const handleExportGlb = useCallback(() => {
    const group = modelGroupRef.current;
    if (!group) {
      setExportError('The 3D scene is not ready to export yet.');
      return;
    }

    setExportError(null);
    new GLTFExporter().parse(
      group,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          setExportError('The GLB exporter returned an unexpected result.');
          return;
        }
        const blob = new Blob([result], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${model.title.trim().replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'learning-model'}.glb`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      (error) => {
        setExportError(error instanceof Error ? error.message : 'Could not export this model as GLB.');
      },
      { binary: true },
    );
  }, [model.title]);

  return (
    <section className="interactive-model" aria-label={`Interactive 3D model: ${model.title}`}>
      <header className="interactive-model__header">
        <div>
          <span className="interactive-model__eyebrow">INTERACTIVE 3D EXPLORER</span>
          <h3>{model.title}</h3>
          <p>{model.subject}</p>
        </div>
        <button type="button" className="interactive-model__export" onClick={handleExportGlb}>
          Download GLB
        </button>
      </header>

      <div className="interactive-model__controls">
        <button
          type="button"
          className={sectionView ? 'is-active' : ''}
          aria-pressed={sectionView}
          onClick={() => setSectionView((active) => !active)}
        >
          Cross-section
        </button>
        <label>
          <span>Explode view</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={explosion}
            onChange={(event) => setExplosion(Number(event.target.value))}
            aria-label="Explode model parts"
          />
        </label>
        <button type="button" onClick={handleResetView}>Reset view</button>
        <span className="interactive-model__hint">Drag to rotate · scroll to zoom · select a part</span>
      </div>

      <div className="interactive-model__body">
        <div className="interactive-model__viewport" ref={viewportRef} role="img" aria-label={`Rotatable 3D model of ${model.subject}`}>
          {renderError && (
            <div className="interactive-model__error" role="alert">
              3D preview unavailable: {renderError}
            </div>
          )}
        </div>
        <aside className="interactive-model__sidebar">
          <div className="interactive-model__part-list" aria-label="Model parts">
            {model.parts.map((part) => (
              <button
                type="button"
                key={part.id}
                className={selectedPart?.id === part.id ? 'is-selected' : ''}
                aria-pressed={selectedPart?.id === part.id}
                onClick={() => setSelectedPartId(part.id)}
              >
                <span style={{ backgroundColor: part.color }} aria-hidden="true" />
                <span>{part.name}</span>
                <small>{part.layer}</small>
              </button>
            ))}
          </div>
          {selectedPart && (
            <div className="interactive-model__details" aria-live="polite">
              <span className="interactive-model__eyebrow">PART INSPECTOR</span>
              <h4>{selectedPart.name}</h4>
              <p>{selectedPart.description}</p>
              {selectedPart.function && (
                <p><strong>Role:</strong> {selectedPart.function}</p>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="interactive-model__footer">
        <p>{model.note || 'Simplified educational model, not to scale. Do not use for diagnosis, treatment, or manufacturing.'}</p>
        {exportError && <p className="interactive-model__export-error" role="alert">{exportError}</p>}
      </footer>
    </section>
  );
}
