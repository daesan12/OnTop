import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Sphere, SphereGeometry, Vector3,
  type ConeGeometry, type CylinderGeometry, type BufferGeometry } from 'three';
import { BUNG_GRILL, bungeoppangClock } from './bungeoppangView';
import { trayPoint } from './layoutV5';
import { heatLook, INGREDIENT_LOOK } from './presentation';
import type { TrayBread } from './rulesV4';
import { selectBungeoppangTray, useBungeoppang } from './store';
import { cookLevel } from './rulesV4';

/** Two draw calls for all ten breads and filling markers. Identity follows the displayed instance. */
export function StockInstances({ tray, geometry, material }: { tray: readonly TrayBread[]; geometry: BufferGeometry; material: MeshStandardMaterial }) {
  const breads = useRef<InstancedMesh>(null), markers = useRef<InstancedMesh>(null);
  const art = useMemo(() => {
    const marker = new SphereGeometry(.019, 10, 6);
    return { marker, material: new MeshStandardMaterial({ color: '#ffffff', roughness: .65, emissive: '#ffffff', emissiveIntensity: .05 }), object: new Object3D(), color: new Color() };
  }, []);
  useEffect(() => () => { art.marker.dispose(); art.material.dispose(); }, [art]);
  useLayoutEffect(() => {
    const bread = breads.current!, marker = markers.current!;
    bread.count = marker.count = tray.length;
    // Allocate the instance-colour shader variant before the first successful take-out.
    if (!marker.instanceColor) marker.setColorAt(0, art.color.set('#ffffff'));
    bread.userData.breadIds = tray.map(b => b.id);
    tray.forEach((item, index) => {
      art.object.position.set(...trayPoint(index)); art.object.updateMatrix();
      bread.setMatrixAt(index, art.object.matrix);
      art.object.position.y += .04; art.object.updateMatrix(); marker.setMatrixAt(index, art.object.matrix);
      marker.setColorAt(index, art.color.set(INGREDIENT_LOOK[item.filling].color));
    });
    for (const mesh of [bread, marker]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = new Sphere(new Vector3(...trayPoint(2)), 1);
    }
    if (marker.instanceColor) marker.instanceColor.needsUpdate = true;
  }, [tray, art]);
  return <>
    <instancedMesh name="bungeoppang-stock" ref={breads} args={[geometry, material, 10]}
      onPointerDown={e => {
        e.stopPropagation();
        const id = (breads.current!.userData.breadIds as number[])[e.instanceId ?? -1];
        if (id !== undefined) selectBungeoppangTray(id);
      }} />
    <instancedMesh name="bungeoppang-stock-markers" ref={markers} args={[art.marker, art.material, 10]}
      onPointerDown={e => {
        e.stopPropagation();
        const id = (breads.current!.userData.breadIds as number[])[e.instanceId ?? -1];
        if (id !== undefined) selectBungeoppangTray(id);
      }} />
  </>;
}

/** The front observation bay exposes each mould's burner without covering the food above it. */
const burnerPoints = BUNG_GRILL.slots.map(([x], i) =>
  [x + (i < 3 ? -.075 : .075), BUNG_GRILL.top - .14, BUNG_GRILL.center[2] + .53] as const);
export function BurnerInstances({ geometry, foot, metal, outer, inner }: {
  geometry: ConeGeometry; foot: CylinderGeometry; metal: MeshStandardMaterial; outer: MeshBasicMaterial; inner: MeshBasicMaterial;
}) {
  const flames = useRef<InstancedMesh>(null), cores = useRef<InstancedMesh>(null), feet = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ object: new Object3D(),
    indicators: Array.from({ length: 6 }, () => ({ visible: false, scale: [0, 0, 0], heat: 100, speed: 1 })) }), []);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useLayoutEffect(() => {
    burnerPoints.forEach((p, i) => {
      scratch.object.position.set(...p); scratch.object.scale.setScalar(1); scratch.object.updateMatrix();
      feet.current!.setMatrixAt(i, scratch.object.matrix);
    });
    feet.current!.instanceMatrix.needsUpdate = true;
    for (const mesh of [flames.current!, cores.current!, feet.current!])
      mesh.boundingSphere = new Sphere(new Vector3(...BUNG_GRILL.center), 2);
    flames.current!.userData.burners = scratch.indicators;
  }, [scratch]);
  useFrame(() => {
    const s = useBungeoppang.getState(), object = scratch.object;
    let any = false;
    burnerPoints.forEach(([x, y, z], i) => {
      const slot = s.grill?.slots[i], visible = slot?.phase === 'front' || slot?.phase === 'back';
      const heat = slot?.heat ?? 100, look = heatLook(heat, bungeoppangClock.t, s.rules);
      const size = (.62 + (heat - 85) / 30 * .68) * (look.rush ? 1.3 : 1);
      const flicker = reduced ? 1 : 1 + Math.sin(performance.now() * .013 + i) * .05;
      const indicator = scratch.indicators[i]!;
      indicator.visible = visible; indicator.heat = heat; indicator.speed = look.speed;
      indicator.scale[0] = size; indicator.scale[1] = size * flicker; indicator.scale[2] = size;
      for (let j = 0; j < 8; j++) {
        const angle = j / 8 * Math.PI * 2;
        object.position.set(x + Math.cos(angle) * .05, y + .055, z + Math.sin(angle) * .05);
        object.scale.set(visible ? size : 0, visible ? size * flicker : 0, visible ? size : 0); object.updateMatrix();
        flames.current!.setMatrixAt(i * 8 + j, object.matrix);
        object.scale.set(object.scale.x * .45, object.scale.y * .64, object.scale.z * .45); object.updateMatrix();
        cores.current!.setMatrixAt(i * 8 + j, object.matrix);
      }
      any ||= visible;
    });
    flames.current!.visible = cores.current!.visible = any;
    if (any) { flames.current!.instanceMatrix.needsUpdate = true; cores.current!.instanceMatrix.needsUpdate = true; }
  });
  return <>
    <instancedMesh ref={feet} args={[foot, metal, 6]} />
    <instancedMesh name="bungeoppang-burners" ref={flames} args={[geometry, outer, 48]} />
    <instancedMesh ref={cores} args={[geometry, inner, 48]} />
  </>;
}

/** Small volumes rise from cooking food; no flat DOM steam sprites in the v5 view. */
export function SteamInstances() {
  const ref = useRef<InstancedMesh>(null);
  const art = useMemo(() => ({ geometry: new SphereGeometry(1, 7, 5),
    material: new MeshBasicMaterial({ transparent: true, opacity: .17, depthWrite: false }),
    object: new Object3D(), color: new Color() }), []);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => () => { art.geometry.dispose(); art.material.dispose(); }, [art]);
  useFrame(() => {
    const s = useBungeoppang.getState(), object = art.object;
    for (let i = 0; i < 6; i++) {
      const slot = s.grill?.slots[i], active = slot && (slot.phase === 'front' || slot.phase === 'back');
      const level = active ? cookLevel(slot.since, bungeoppangClock.t, slot.heat, s.rules) : 0;
      const [x, z] = BUNG_GRILL.slots[i]!;
      for (let j = 0; j < 3; j++) {
        const t = reduced ? .25 + j * .2 : (performance.now() / 1600 + j / 3 + i * .17) % 1;
        object.position.set(x + Math.sin(i + j + t * 3) * .02, BUNG_GRILL.top + .04 + t * .22, z);
        object.scale.setScalar(active && level > 40 ? (.009 + t * .015) * (1 - t) : 0);
        object.updateMatrix(); ref.current!.setMatrixAt(i * 3 + j, object.matrix);
        ref.current!.setColorAt(i * 3 + j, art.color.set(level >= 100 ? '#4d4946' : '#eee5d1'));
      }
    }
    ref.current!.instanceMatrix.needsUpdate = true; ref.current!.instanceColor!.needsUpdate = true;
  });
  return <instancedMesh name="bungeoppang-volume-steam" ref={ref} args={[art.geometry, art.material, 18]} frustumCulled={false} dispose={null} />;
}
