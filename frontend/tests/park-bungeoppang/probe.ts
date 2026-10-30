import { _roots } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';

export function cookingStageReady() {
  const canvas = document.querySelector('canvas');
  return !!canvas && !!_roots.get(canvas)?.store.getState().scene.getObjectByName('bungeoppang-cooking-stage');
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
