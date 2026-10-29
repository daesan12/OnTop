import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, type PointLight } from 'three';
import { PropBuilder } from './devArt/propGeometry';
import { griddle } from './privateGriddle';
import { metalGrain, outdoorReflectionMap } from '../../world/art/ornamentTextures';
import { SurfaceMaterial } from './devArt/SurfaceMaterial';
import { FISH_CART_GRILL } from '../../config/fishCart';
import { cartPoint } from './layoutV5';
import { environmentFrame } from '../../world/environmentState';

const LANTERN_X = [-1.69, .39] as const;

/** Warm, short-range working lights; no extra shadow maps or global exposure changes. */
function CookingLights() {
  const lights = useRef<(PointLight | null)[]>([]);
  useFrame((_, delta) => {
    const target = .65 + (1 - environmentFrame.daylight) * 2.75;
    for (const light of lights.current) if (light) {
      light.intensity += (target - light.intensity) * (1 - Math.exp(-6 * delta));
    }
  });
  return <group name="bungeoppang-cooking-lights">
    {LANTERN_X.map((x, i) => <pointLight key={x} name={`bungeoppang-lantern-light-${i}`}
      ref={light => { lights.current[i] = light; }} position={[x, 1.73, -.55]}
      color="#ffe0b5" intensity={.65} distance={3.2} decay={2} castShadow={false} />)}
  </group>;
}

/** A private, close cooking set. The public park cart is restored on exit. */
export function BungeoppangStageV5() {
  const art = useMemo(() => {
    const b = new PropBuilder([16, 10]);
    griddle(b, true);
    for (const x of FISH_CART_GRILL.columns) for (const z of FISH_CART_GRILL.rows) {
      b.box('stone', '#28231f', [-.66 + x, FISH_CART_GRILL.surfaceY + .004, .03 + z], [.387, .012, .315]);
      for (const dx of [-.174, .174]) for (const dz of [-.135, .135]) {
        b.cylinder('gold', '#9e7b4f', [-.66 + x + dx, FISH_CART_GRILL.surfaceY + .012, .03 + z + dz], .006, .006, .006);
      }
    }
    // Keep the original six mould anchors, surrounded by warm oak instead of a wide park view.
    for (let i = 0; i < 13; i++) {
      b.box('wood', i % 3 === 0 ? '#84502e' : '#9b6136', [-.66, 1.12, -1.10 + i * .18], [4.8, .105, .174]);
      b.box('wood', '#56321f', [-.66, 1.067, -1.10 + i * .18], [4.8, .014, .18]);
    }
    for (const x of [-1.40, .08]) {
      b.box('wood', '#714327', [x, 1.20, .025], [.11, .15, .98]);
      b.box('gold', '#b88a4f', [x, 1.28, .025], [.012, .014, .97]);
      for (const z of [-.40, .45]) b.cylinder('metal', '#c3a471', [x, 1.283, z], .012, .012, .008);
    }
    b.box('wood', '#5d3622', [-.66, 1.19, -.51], [1.62, .18, .10]);
    b.box('wood', '#5d3622', [-.66, 1.16, .57], [1.62, .13, .10]);
    // Broad rear screen masks unrelated ground geometry without a camera billboard.
    b.box('wood', '#523421', [-.66, 1.0, -1.50], [6, 2.6, .10]);
    for (let i = 0; i < 19; i++) b.box('wood', i % 2 ? '#623d25' : '#72492d', [-3.5 + i * .32, 1.0, -1.43], [.30, 2.6, .025]);
    for (const x of LANTERN_X) {
      b.cylinder('gold', '#a47a45', [x, 1.64, -.68], .035, .04, 1.15);
      b.cylinder('gold', '#573b26', [x, 1.86, -.55], .15, .09, .10);
      b.ball('glow', '#ffe1a2', [x, 1.73, -.55], [.105, .16, .105]);
      for (const y of [1.60, 1.66, 1.73, 1.80, 1.87]) b.ring('gold', '#b48d54', [x, y, -.55], .103, .004, [Math.PI / 2, 0, 0]);
    }
    const geometries = b.finish();
    const materials = {
      metal: new MeshStandardMaterial({ vertexColors: true, metalness: .65, roughness: .43,
        envMap: outdoorReflectionMap, roughnessMap: metalGrain, emissive: '#78502d', emissiveIntensity: .13 }),
      stone: new MeshStandardMaterial({ vertexColors: true, roughness: .85, emissive: '#553b21', emissiveIntensity: .10 }),
      gold: new MeshStandardMaterial({ vertexColors: true, metalness: .55, roughness: .42, envMap: outdoorReflectionMap,
        emissive: '#a56e34', emissiveIntensity: .12 }),
      glow: new MeshStandardMaterial({ color: '#ffe3b2', emissive: '#ffa94b', emissiveIntensity: 1.1, toneMapped: false }),
    };
    return { geometries, materials };
  }, []);
  useEffect(() => () => {
    Object.values(art.geometries).forEach(g => g?.dispose());
    Object.values(art.materials).forEach(m => m.dispose());
  }, [art]);
  return <group name="bungeoppang-cooking-stage" position={cartPoint(0, 0, 0)}>
    <CookingLights />
    {Object.entries(art.geometries).map(([finish, geometry]) => finish === 'wood' ? <mesh key={finish}>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <SurfaceMaterial kind="wood" mapping="box" vertexColors meters={.65} strength={.35} detail={.8} />
    </mesh> : <mesh key={finish} geometry={geometry} material={art.materials[finish as keyof typeof art.materials]} dispose={null} />)}
  </group>;
}
