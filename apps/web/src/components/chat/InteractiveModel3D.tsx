import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { InteractiveModel, InteractiveModelPart } from './interactiveModelSchema';
import './InteractiveModel3D.css';

interface InteractiveModel3DProps {
  model: InteractiveModel;
}

// ── Realistic PBR Material Engine for AI-Generated Parts ──────────────────────
function getRealisticMaterial(part: InteractiveModelPart): THREE.MeshStandardMaterial {
  const name = (part.name + ' ' + part.id).toLowerCase();

  // Hardened Tool Steel / Saw Blades / Teeth
  if (/saw|blade|disc|teeth|tooth/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#e2e8f0',
      metalness: 0.95,
      roughness: 0.14,
    });
  }

  // Cast Iron / Separation Grates / Structural Brackets / Frames
  if (/grate|rib|comb|slot|chassis|frame|stand/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#334155',
      metalness: 0.85,
      roughness: 0.38,
    });
  }

  // Industrial Sheet Metal / Tapered Hoppers / Bins / Chambers
  if (/hopper|funnel|chute|bin|collector|chamber|box/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#475569',
      metalness: 0.55,
      roughness: 0.42,
    });
  }

  // Natural Fiber / Rotating Brush Bristles
  if (/brush|doffer|bristle|fiber/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#f8fafc',
      metalness: 0.08,
      roughness: 0.85,
    });
  }

  // Machined Precision Steel / Forged Alloy (Piston, crankshaft, camshaft, wrist pin, connecting rod)
  if (/piston|crank|cam|rod|pin|journal|shaft|bearing/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#cbd5e1',
      metalness: 0.92,
      roughness: 0.22,
    });
  }

  // Cast Aluminum / Engine Blocks / Housings
  if (/block|head|pan|housing|case|liner|wall/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#475569',
      metalness: 0.72,
      roughness: 0.46,
    });
  }

  // Nitrided Hardened Steel / Rings / Sprockets / Gears
  if (/ring|gear|sprocket|chain|belt|flywheel/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#334155',
      metalness: 0.95,
      roughness: 0.18,
    });
  }

  // Ceramic / Insulators
  if (/spark|ceramic|insulator/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#f8fafc',
      metalness: 0.05,
      roughness: 0.12,
    });
  }

  // Spring Steel / Valves
  if (/spring|valve/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#94a3b8',
      metalness: 0.88,
      roughness: 0.24,
    });
  }

  // Exhaust / Intake Manifolds
  if (/manifold|exhaust|intake|header|pipe/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: part.color || '#b45309',
      metalness: 0.85,
      roughness: 0.32,
    });
  }

  // Default PBR Material honoring AI-selected color and realistic metallic luster
  return new THREE.MeshStandardMaterial({
    color: part.color,
    metalness: 0.75,
    roughness: 0.28,
  });
}

// ── Procedural Helical Curve for Mechanical Springs ──────────────────────────
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  turns: number;
  radius: number;
  height: number;
  constructor(turns = 6, radius = 0.35, height = 0.9) {
    super();
    this.turns = turns;
    this.radius = radius;
    this.height = height;
  }
  getPoint(t: number): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.turns;
    const x = Math.cos(angle) * this.radius;
    const y = (t - 0.5) * this.height;
    const z = Math.sin(angle) * this.radius;
    return new THREE.Vector3(x, y, z);
  }
}

// ── High-Fidelity Geometry Engine for AI-Generated Model Parts ────────────────
function createPartMesh(part: InteractiveModelPart): THREE.Object3D {
  const mat = getRealisticMaterial(part);
  const name = (part.name + ' ' + part.id).toLowerCase();

  // 1. Photorealistic Machined Piston Assembly
  if (/piston/i.test(name)) {
    const group = new THREE.Group();
    // Piston Crown with beveled top deck
    const crownGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.55, 48);
    const crownMesh = new THREE.Mesh(crownGeo, mat);
    crownMesh.position.y = 0.225;
    group.add(crownMesh);

    // 3 Nitrided Steel Piston Rings in lands
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.95, roughness: 0.1 });
    [-0.05, 0.08, 0.2].forEach((ry) => {
      const ringGeo = new THREE.TorusGeometry(0.505, 0.015, 8, 48);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = ry + 0.15;
      group.add(ringMesh);
    });

    // Piston Skirt with weight relief
    const skirtGeo = new THREE.CylinderGeometry(0.48, 0.46, 0.45, 48);
    const skirtMesh = new THREE.Mesh(skirtGeo, mat);
    skirtMesh.position.y = -0.275;
    group.add(skirtMesh);

    // Wrist Pin Bore
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.3 });
    const pinGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.02, 24);
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.rotation.z = Math.PI / 2;
    pinMesh.position.y = -0.12;
    group.add(pinMesh);

    return group;
  }

  // 2. Forged Connecting Rod with Eye Bushings & Rod Cap Bolts
  if (/rod|connecting/i.test(name)) {
    const group = new THREE.Group();
    // Small End (Wrist pin bushing)
    const smallEndGeo = new THREE.TorusGeometry(0.18, 0.07, 16, 48);
    const smallEnd = new THREE.Mesh(smallEndGeo, mat);
    smallEnd.position.y = 0.44;
    group.add(smallEnd);

    // Shank with I-beam forged profile
    const shankGeo = new RoundedBoxGeometry(0.14, 0.62, 0.08, 4, 0.02);
    const shank = new THREE.Mesh(shankGeo, mat);
    group.add(shank);

    // Big End (Crankpin journal)
    const bigEndGeo = new THREE.TorusGeometry(0.28, 0.09, 16, 48);
    const bigEnd = new THREE.Mesh(bigEndGeo, mat);
    bigEnd.position.y = -0.44;
    group.add(bigEnd);

    // Rod Cap Bolts
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.95, roughness: 0.2 });
    [-0.24, 0.24].forEach((bx) => {
      const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 16);
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(bx, -0.44, 0);
      group.add(bolt);
    });

    return group;
  }

  // 3. Toothed Circular Saw Blades, Gears & Sprockets
  if (/saw|blade|teeth|gear|sprocket/i.test(name)) {
    const group = new THREE.Group();
    // Disc body with axle hole
    const discGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.1, 48);
    const disc = new THREE.Mesh(discGeo, mat);
    group.add(disc);

    const boreMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.4 });
    const boreGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 24);
    const bore = new THREE.Mesh(boreGeo, boreMat);
    group.add(bore);

    // Radial teeth array around perimeter
    const toothCount = 20;
    const toothMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.98,
      roughness: 0.1,
    });
    for (let i = 0; i < toothCount; i++) {
      const angle = (i / toothCount) * Math.PI * 2;
      const toothGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
      const tooth = new THREE.Mesh(toothGeo, toothMat);
      tooth.position.set(Math.cos(angle) * 0.48, 0, Math.sin(angle) * 0.48);
      tooth.rotation.y = -angle;
      tooth.rotation.z = -Math.PI / 2;
      group.add(tooth);
    }
    return group;
  }

  // 4. Helical Spring
  if (/spring/i.test(name)) {
    const helix = new HelixCurve(6, 0.35, 0.9);
    const springGeo = new THREE.TubeGeometry(helix, 80, 0.04, 12, false);
    return new THREE.Mesh(springGeo, mat);
  }

  // 5. Poppet Valve
  if (/valve/i.test(name)) {
    const group = new THREE.Group();
    const headGeo = new THREE.CylinderGeometry(0.38, 0.16, 0.12, 36);
    const headMesh = new THREE.Mesh(headGeo, mat);
    headMesh.position.y = -0.44;
    group.add(headMesh);

    const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.88, 24);
    const stemMesh = new THREE.Mesh(stemGeo, mat);
    stemMesh.position.y = 0.06;
    group.add(stemMesh);
    return group;
  }

  // 6. Industrial Tapered Hopper / Chute / Bin
  if (/hopper|funnel|chute|bin/i.test(name)) {
    const group = new THREE.Group();
    const hopperGeo = new THREE.CylinderGeometry(0.55, 0.3, 0.95, 4, 1, true);
    hopperGeo.rotateY(Math.PI / 4);
    const hopperMesh = new THREE.Mesh(hopperGeo, mat);
    hopperMesh.material.side = THREE.DoubleSide;
    group.add(hopperMesh);

    const rimGeo = new RoundedBoxGeometry(0.82, 0.05, 0.82, 4, 0.015);
    const rimMesh = new THREE.Mesh(rimGeo, mat);
    rimMesh.position.y = 0.48;
    group.add(rimMesh);
    return group;
  }

  // 7. Engine Block / Cylinder Head with Bored Recesses
  if (/block|head/i.test(name) && part.shape === 'box') {
    const group = new THREE.Group();
    const blockGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.04);
    const blockMesh = new THREE.Mesh(blockGeo, mat);
    group.add(blockMesh);

    const boreMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.3 });
    const borePositions = [-0.36, -0.12, 0.12, 0.36];
    borePositions.forEach((bx) => {
      const boreGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 32);
      const boreMesh = new THREE.Mesh(boreGeo, boreMat);
      boreMesh.position.set(bx, 0.49, 0);
      group.add(boreMesh);
    });

    return group;
  }

  // 8. Default High-Fidelity Shapes with Beveling & Smooth Subdivision
  let geo: THREE.BufferGeometry;
  switch (part.shape) {
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 64);
      break;
    case 'box':
      // Machined metal chamfers & rounded bevels
      geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.05);
      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(0.5, 1, 24, 48);
      break;
    case 'ellipsoid':
    case 'sphere':
      geo = new THREE.SphereGeometry(0.5, 64, 48);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(0.4, 0.14, 24, 64);
      break;
    default:
      geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.05);
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function InteractiveModel3D({ model }: InteractiveModel3DProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const objectByPartRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const basePositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
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
    let pmremGenerator: THREE.PMREMGenerator | null = null;
    let envTexture: THREE.Texture | null = null;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x11100f);

      const camera = new THREE.PerspectiveCamera(42, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
      camera.position.set(4.8, 3.4, 5.6);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(viewport.clientWidth, viewport.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      viewport.replaceChildren(renderer.domElement);

      // Studio HDR-style Environment
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
      scene.environment = envTexture;

      // Studio Lighting
      const ambLight = new THREE.AmbientLight(0xfff7ed, 1.2);
      scene.add(ambLight);

      const keyLight = new THREE.DirectionalLight(0xffedd5, 2.8);
      keyLight.position.set(6, 8, 7);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.001;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
      fillLight.position.set(-6, 3, -5);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xfef08a, 1.8);
      rimLight.position.set(0, -5, -6);
      scene.add(rimLight);

      // Studio Ground Grid
      const floorGrid = new THREE.GridHelper(16, 32, 0x3f3f46, 0x18181b);
      floorGrid.position.y = -2.8;
      scene.add(floorGrid);

      const group = new THREE.Group();
      const objMap = new Map<string, THREE.Object3D>();
      const basePositions = new Map<string, THREE.Vector3>();

      // Render the AI's dynamically generated 3D components
      for (const part of model.parts) {
        const partMesh = createPartMesh(part);
        partMesh.name = part.name;
        partMesh.position.set(...part.position);
        partMesh.scale.set(...part.scale);
        partMesh.userData.partId = part.id;

        partMesh.traverse((node) => {
          node.userData.partId = part.id;
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        group.add(partMesh);
        objMap.set(part.id, partMesh);
        basePositions.set(part.id, partMesh.position.clone());
      }

      scene.add(group);
      modelGroupRef.current = group;
      objectByPartRef.current = objMap;
      basePositionsRef.current = basePositions;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 2.0;
      controls.maxDistance = 16;
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
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(group.children, true);
        const hit = hits.find((entry) => Boolean(entry.object.userData.partId));
        if (hit?.object.userData.partId) {
          setSelectedPartId(String(hit.object.userData.partId));
        }
      };

      const domElement = renderer.domElement;
      domElement.addEventListener('pointerdown', handlePointerDown);
      domElement.addEventListener('pointerup', handlePointerUp);

      let animId: number;
      const render = () => {
        controls.update();
        renderer.render(scene, camera);
        animId = requestAnimationFrame(render);
      };
      animId = requestAnimationFrame(render);

      const handleResize = () => {
        if (!viewport) return;
        camera.aspect = viewport.clientWidth / viewport.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(viewport.clientWidth, viewport.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', handleResize);
        domElement.removeEventListener('pointerdown', handlePointerDown);
        domElement.removeEventListener('pointerup', handlePointerUp);
        controls.dispose();
        renderer.dispose();
        pmremGenerator?.dispose();
        envTexture?.dispose();
        modelGroupRef.current = null;
        objectByPartRef.current.clear();
        basePositionsRef.current.clear();
        controlsRef.current = null;
      };
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'WebGL could not initialize in this browser.');
      return;
    }
  }, [model]);

  // Exploded View Slider Implementation
  useEffect(() => {
    if (!model.parts || model.parts.length === 0) return;

    const center = model.parts
      .reduce((sum, part) => sum.add(new THREE.Vector3(...part.position)), new THREE.Vector3())
      .multiplyScalar(1 / model.parts.length);

    for (const part of model.parts) {
      const obj = objectByPartRef.current.get(part.id);
      if (!obj) continue;
      const base = basePositionsRef.current.get(part.id) ?? obj.position;
      const explodeVector = base.clone().sub(center);
      if (explodeVector.lengthSq() < 0.0001) {
        explodeVector.set(0, 1, 0);
      } else {
        explodeVector.normalize();
      }
      obj.position.copy(base.clone().addScaledVector(explodeVector, explosion * 1.5));
    }
  }, [explosion, model.parts]);

  // Cross-section & Part Highlighting
  useEffect(() => {
    for (const part of model.parts) {
      const obj = objectByPartRef.current.get(part.id);
      if (!obj) continue;
      const isSelected = part.id === selectedPartId;
      const isOuter = part.layer === 'outer';

      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.transparent = sectionView && isOuter;
          child.material.opacity = sectionView && isOuter ? 0.28 : 1.0;
          child.material.roughness = isSelected ? 0.15 : child.material.roughness;
          if (isSelected) {
            child.material.emissive = new THREE.Color('#d97757');
            child.material.emissiveIntensity = 0.35;
          } else {
            child.material.emissive = new THREE.Color('#000000');
            child.material.emissiveIntensity = 0;
          }
          child.material.needsUpdate = true;
        }
      });
    }
  }, [selectedPartId, sectionView, model.parts]);

  const handleResetView = useCallback(() => {
    setExplosion(0);
    setSectionView(false);
    setSelectedPartId(model.parts[0]?.id ?? '');
    const controls = controlsRef.current;
    if (controls) {
      controls.reset();
      controls.object.position.set(4.8, 3.4, 5.6);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [model.parts]);

  const handleExportGlb = useCallback(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    setExportError(null);
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${model.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.glb`;
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        setExportError(error instanceof Error ? error.message : 'Could not export GLB file.');
      },
      { binary: true }
    );
  }, [model.title]);

  return (
    <section className="interactive-model" aria-label={`3D model of ${model.title}`}>
      <header className="interactive-model__header">
        <div>
          <span className="interactive-model__eyebrow">AI-GENERATED 3D EXPLORER</span>
          <h3>{model.title}</h3>
          <p>{model.subject}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="interactive-model__export" onClick={handleExportGlb}>
            Download GLB
          </button>
        </div>
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
        <button type="button" onClick={handleResetView}>
          Reset view
        </button>
        <span className="interactive-model__hint">
          Drag to rotate · Scroll to zoom · Click part to inspect
        </span>
      </div>

      <div className="interactive-model__workspace">
        <div className="interactive-model__stage">
          <div ref={viewportRef} className="interactive-model__viewport" />
          {renderError && <p className="interactive-model__error">{renderError}</p>}
          {exportError && <p className="interactive-model__error">{exportError}</p>}
        </div>

        <aside className="interactive-model__sidebar">
          <div className="interactive-model__parts" role="radiogroup" aria-label="Model parts">
            {model.parts.map((part) => {
              const isSelected = part.id === selectedPartId;
              return (
                <button
                  key={part.id}
                  type="button"
                  className={`interactive-model__part-btn ${isSelected ? 'is-selected' : ''}`}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedPartId(part.id)}
                >
                  <span
                    className="interactive-model__color-dot"
                    style={{ background: part.color }}
                    aria-hidden="true"
                  />
                  <span className="interactive-model__part-name">{part.name}</span>
                  <span className="interactive-model__part-layer">{part.layer}</span>
                </button>
              );
            })}
          </div>

          {selectedPart && (
            <div className="interactive-model__inspector">
              <span className="interactive-model__inspector-title">PART INSPECTOR</span>
              <h4>{selectedPart.name}</h4>
              <p>{selectedPart.description}</p>
              {selectedPart.function && (
                <p className="interactive-model__role">
                  <strong>Role:</strong> {selectedPart.function}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {model.note && (
        <footer className="interactive-model__footer">
          <p>{model.note}</p>
        </footer>
      )}
    </section>
  );
}
