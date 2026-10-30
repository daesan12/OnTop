import { _roots } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import { BUNG_GRILL, bungeoppangView } from '../../src/features/bungeoppang/bungeoppangView';

export function cookingStageReady() {
  const canvas = document.querySelector('canvas');
  return !!canvas && !!_roots.get(canvas)?.store.getState().scene.getObjectByName('bungeoppang-cooking-stage');
}

export function plateClickPoints() {
  const { camera, gl } = [..._roots.values()][0]!.store.getState();
  const rect = gl.domElement.getBoundingClientRect();
  return BUNG_GRILL.slots.map(([x, z]) => [-.12, .12].map(dz => {
    const p = new Vector3(x, BUNG_GRILL.top + .002, z + dz).project(camera);
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }));
}

export function exitCartVisibility() {
  const { scene } = [..._roots.values()][0]!.store.getState();
  const cart = scene.getObjectByName('fish-bread-cooking-cart');
  return { returning: !bungeoppangView.active && performance.now() < bungeoppangView.returningUntil,
    cartVisible: !!cart?.visible };
}

export function customerSizeProbe() {
  const { scene, camera, gl } = [..._roots.values()][0]!.store.getState();
  const actors = scene.getObjectByName('bungeoppang-npc-actors');
  const rect = gl.domElement.getBoundingClientRect();
  return (actors?.children ?? []).map(actor => {
    const bounds = new Box3().setFromObject(actor), top = bounds.getCenter(new Vector3());
    top.y = bounds.max.y; top.project(camera);
    return { lookId: String(actor.userData.lookId), height: bounds.max.y - bounds.min.y,
      top: rect.top + (1 - top.y) * rect.height / 2 };
  });
}
