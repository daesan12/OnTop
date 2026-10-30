import { _roots } from '@react-three/fiber';

export function cookingStageReady() {
  const canvas = document.querySelector('canvas');
  return !!canvas && !!_roots.get(canvas)?.store.getState().scene.getObjectByName('bungeoppang-cooking-stage');
}
