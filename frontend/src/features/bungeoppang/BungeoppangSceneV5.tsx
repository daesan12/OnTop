import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three';
import { createSculptedFish } from '../../world/art/fishBreadGeometry';
import { BungeoppangCustomersV5 } from './BungeoppangCustomersV5';
import { PropBuilder } from '../../world/art/propGeometry';
import { type BungFeedback } from './presentation';
import { trashPoint } from './layoutV5';
import { environmentFrame } from '../../world/environmentState';
import { metalGrain, outdoorReflectionMap } from '../../world/art/ornamentTextures';
import { isV5Grill } from './rulesV5';
import { trashBungeoppangSelection, useBungeoppang } from './store';
import { BurnerInstances, StockInstances, SteamInstances } from './BungeoppangInstancesV5';

/** Everything here belongs to this client's cooking view. No world membership or collision is created. */
export function BungeoppangSceneV5() {
  const grill = useBungeoppang(s => s.grill), phase = useBungeoppang(s => s.phase);
  const feedback = useBungeoppang(s => s.feedback);
  const art = useMemo(() => ({
    fish: createSculptedFish(.46),
    flame: new ConeGeometry(.023, .12, 9), burner: new CylinderGeometry(.071, .085, .035, 24),
    crust: new MeshStandardMaterial({ color: '#e3ac52', vertexColors: true, roughness: .76, emissive: '#b28a46', emissiveIntensity: .12 }),
    metal: new MeshStandardMaterial({ color: '#5b6061', metalness: .65, roughness: .38, roughnessMap: metalGrain, envMap: outdoorReflectionMap }),
    flameMaterial: new MeshBasicMaterial({ color: '#2ca8ff', transparent: true, opacity: .88, depthWrite: false }),
    coreMaterial: new MeshBasicMaterial({ color: '#c6eeff', transparent: true, opacity: .95, depthWrite: false }),
  }), []);
  useEffect(() => {
    for (const material of [art.crust]) {
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;\n totalEmissiveRadiance += diffuseColor.rgb * (0.10 + 0.22 * max(0.0, dot(normal, normalize(vec3(-0.5, 0.65, 0.7)))));');
      };
      material.customProgramCacheKey = () => 'bungeoppang-private-25d-lit-v1';
      material.needsUpdate = true;
    }
  }, [art]);
  useEffect(() => () => {
    art.fish.dispose(); art.flame.dispose(); art.burner.dispose();
    [art.crust, art.metal, art.flameMaterial, art.coreMaterial].forEach(m => m.dispose());
  }, [art]);
  useFrame(() => {
    // A material-local night floor avoids adding a new light permutation to every park shader.
    art.crust.emissiveIntensity = .10 + environmentFrame.night * .12;
  });
  if (!grill || !('rulesVersion' in grill) || !isV5Grill(grill) || !['countdown', 'play', 'ending'].includes(phase)) return null;
  return <group name="bungeoppang-v5-private">
    <mesh name="bungeoppang-flight-prewarm" visible={false} geometry={art.fish} material={art.crust} dispose={null} />
    <BungeoppangCustomersV5 orders={grill.activeOrders} feedback={feedback} />
    <StockInstances tray={grill.tray} geometry={art.fish} material={art.crust} />
    <BurnerInstances geometry={art.flame} foot={art.burner} metal={art.metal} outer={art.flameMaterial} inner={art.coreMaterial} />
    <SteamInstances />
    <Trash />
    {feedback.filter(item => item.fromWorld && item.toWorld).map(item => <Flight key={item.id} item={item} geometry={art.fish} material={art.crust} />)}
  </group>;
}

function Trash() {
  const lid = useRef<Group>(null);
  const art = useMemo(() => {
    const body = new PropBuilder([12, 8]), cap = new PropBuilder([12, 8]);
    body.lathe('metal', '#929b96', [0, 0, 0], [[.12, -.43], [.14, -.42], [.145, -.39], [.16, -.025], [.17, -.012], [.17, .006], [.154, .006], [.15, -.025], [.136, -.39]]);
    for (const y of [-.40, -.035, 0]) body.ring('metal', '#c1c6bc', [0, y, 0], y < -.1 ? .14 : .164, .008, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      body.curve('metal', '#aeb6ad', [[Math.cos(a) * .141, -.38, Math.sin(a) * .141], [Math.cos(a) * .155, -.05, Math.sin(a) * .155]], .0025, 3);
    }
    for (const sign of [-1, 1]) {
      body.curve('metal', '#c5c8bd', [[sign * .15, -.10, -.04], [sign * .20, -.12, -.04], [sign * .20, -.18, -.04], [sign * .15, -.18, -.04]], .009, 8);
      body.ball('metal', '#5b655e', [sign * .15, -.10, -.04], [.012, .012, .012]);
    }
    body.box('metal', '#333c39', [0, -.41, .17], [.12, .025, .09]);
    for (let i = 0; i < 5; i++) body.box('metal', '#8e9890', [-.043 + i * .022, -.395, .17], [.009, .004, .07]);
    cap.lathe('metal', '#c4c8bd', [0, 0, .13], [[.16, -.009], [.174, -.005], [.174, .01], [.145, .025], [.08, .04], [0, .045]]);
    cap.curve('metal', '#4b5550', [[-.045, .04, .13], [-.045, .075, .13], [.045, .075, .13], [.045, .04, .13]], .009, 10);
    return { body: body.finish().metal!, lid: cap.finish().metal!, material: new MeshStandardMaterial({ vertexColors: true, metalness: .58, roughness: .36,
      roughnessMap: metalGrain, envMap: outdoorReflectionMap, emissive: '#d8d7ba', emissiveIntensity: .05 }) };
  }, []);
  useEffect(() => () => { art.body.dispose(); art.lid.dispose(); art.material.dispose(); }, [art]);
  useFrame(() => {
    const s = useBungeoppang.getState(), latest = s.feedback.filter(i => i.kind === 'discard').at(-1);
    // Feedback lifetime is bounded by the store; no independent timer owns a stale round.
    if (lid.current) lid.current.rotation.x = latest ? -.35 : 0;
  });
  return <group name="bungeoppang-trash" position={trashPoint} onPointerDown={e => { e.stopPropagation(); trashBungeoppangSelection(); }}>
    <mesh geometry={art.body} material={art.material} />
    <mesh position={[0, .005, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.135, 16]} /><meshBasicMaterial color="#162422" /></mesh>
    <group ref={lid} position={[0, .04, -.13]}>
      <mesh geometry={art.lid} material={art.material} />
    </group>
    <mesh position={[0, -.16, .14]}><boxGeometry args={[.105, .1, .015]} /><meshStandardMaterial color="#e3d7b6" /></mesh>
  </group>;
}
function Flight({ item, geometry, material }: { item: BungFeedback; geometry: BufferGeometry; material: MeshStandardMaterial }) {
  const ref = useRef<Mesh>(null), born = useRef(performance.now());
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const motion = useMemo(() => ({ from: new Vector3(...item.fromWorld!), to: new Vector3(...item.toWorld!) }), [item]);
  useFrame(() => {
    const t = Math.min(1, (performance.now() - born.current) / (reduced ? 120 : 550)), mesh = ref.current;
    if (!mesh) return;
    mesh.visible = t < 1;
    mesh.position.lerpVectors(motion.from, motion.to, t);
    mesh.position.y += reduced ? 0 : Math.sin(t * Math.PI) * .35;
    mesh.rotation.y = t * .35; mesh.scale.setScalar(item.kind === 'discard' ? 1 - t * .7 : 1);
  });
  return <mesh ref={ref} name={`bungeoppang-flight-${item.kind}`} geometry={geometry} material={material} position={item.fromWorld} />;
}
