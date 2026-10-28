import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader } from 'three';
import { BUNG_GRILL, bungeoppangClock, slotFx } from './bungeoppangView';
import { cookLevel } from './rulesV4';
import { useBungeoppang } from './store';

/** Baked food detail follows the real mould, perspective, flip and take-out motion. */
export function BungeoppangFood25V5() {
  const texture = useLoader(TextureLoader, '/art/bungeoppang/fish-states-round-25d.png');
  const meshes = useRef<(Mesh | null)[]>([]);
  const art = useMemo(() => {
    // Tall atlas cells contain transparent padding. Give the fish enough depth
    // to stay plump after the cooking camera foreshortens the iron surface.
    const food = Array.from({ length: 6 }, () => new PlaneGeometry(.28, .70));
    const die = new PlaneGeometry(.29, .72);
    const frame = (geometry: PlaneGeometry, value: number) => {
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, (value + (i % 2 === 0 ? .002 : .998)) / 6);
      uv.needsUpdate = true;
    };
    frame(die, 5); food.forEach(g => frame(g, 0));
    return { food, die, frame, previous: Array(6).fill(0),
      material: new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .04, depthWrite: false, side: DoubleSide, toneMapped: false }) };
  }, [texture]);
  useLayoutEffect(() => { texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; texture.needsUpdate = true; }, [texture]);
  useEffect(() => () => { art.food.forEach(g => g.dispose()); art.die.dispose(); art.material.dispose(); }, [art]);
  useFrame(() => {
    const s = useBungeoppang.getState(), now = performance.now();
    BUNG_GRILL.slots.forEach(([x, z], i) => {
      const mesh = meshes.current[i], slot = s.grill?.slots[i], fx = slotFx[i]!;
      if (!mesh || !slot) return;
      const take = (now - fx.takeAt) / 260, flip = (now - fx.flipAt) / 280;
      mesh.visible = slot.phase !== 'empty' || (take >= 0 && take < 1);
      const level = slot.phase === 'empty' ? 60 : slot.phase === 'batter' ? 0 : cookLevel(slot.since, bungeoppangClock.t, slot.heat, s.rules);
      const state = slot.phase === 'empty' ? art.previous[i] : level >= 100 ? 4 : level > s.rules.goldenTo ? 3 : level >= s.rules.goldenFrom ? 2 : level >= s.rules.okFrom ? 1 : 0;
      if (art.previous[i] !== state) { art.frame(art.food[i]!, state); art.previous[i] = state; }
      const shake = now - fx.shakeAt;
      mesh.position.set(x + (shake < 250 ? Math.sin(shake / 18) * .012 : 0), BUNG_GRILL.top + .019, z);
      mesh.rotation.set(-Math.PI / 2, 0, 0); mesh.scale.setScalar(1);
      if (flip >= 0 && flip < 1) { mesh.position.y += Math.sin(flip * Math.PI) * .14; mesh.rotation.x += flip * Math.PI; }
      else if (take >= 0 && take < 1) { mesh.position.x += take * .5; mesh.position.y += Math.sin(take * Math.PI) * .18; mesh.scale.setScalar(1 - take * .5); }
      else if (slot.phase === 'batter') mesh.scale.setScalar(.35 + .65 * Math.min(1, (now - fx.pourAt) / 200));
    });
  });
  return <group name="bungeoppang-food-25d" dispose={null}>
    {BUNG_GRILL.slots.map(([x, z], i) => <group key={i}>
      <mesh name={`bungeoppang-die-25d-${i}`} position={[x, BUNG_GRILL.top + .012, z]} rotation={[-Math.PI / 2, 0, 0]} geometry={art.die} material={art.material} />
      <mesh name={`bungeoppang-food-25d-${i}`} ref={el => { meshes.current[i] = el; }} visible={false} geometry={art.food[i]} material={art.material} />
    </group>)}
  </group>;
}
