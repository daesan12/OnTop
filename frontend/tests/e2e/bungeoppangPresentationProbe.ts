// Development QA only; no product imports or renderer mutation.
import { _roots } from '@react-three/fiber';
import { m14Probe } from './m14Probe';
import { sceneProbe } from './sceneProbe';
import { Color, type InstancedMesh } from 'three';
export function fillingColors() {
  const { scene } = [..._roots.values()][0]!.store.getState();
  const mesh = scene.getObjectByName('bungeoppang-fillings') as InstancedMesh;
  return Array.from({ length: 4 }, (_, i) => { const color = new Color(); mesh.getColorAt(i, color); return color.getHexString(); });
}
export async function measureBungeoppangPresentation(frames = 90) {
  const { gl } = [..._roots.values()][0]!.store.getState();
  const intervals: number[] = [], calls: number[] = [], triangles: number[] = [];
  let previous = performance.now();
  for (let i = 0; i < frames; i++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const now = performance.now(); intervals.push(now - previous); previous = now;
    calls.push(gl.info.render.calls); triangles.push(gl.info.render.triangles);
  }
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)]!;
  const scene = sceneProbe(), grill = m14Probe();
  return { viewport: [innerWidth, innerHeight], userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    gpu: scene.gpu, calls: percentile(calls, .5), triangles: percentile(triangles, .5),
    frameMs: { median: percentile(intervals, .5), p95: percentile(intervals, .95) },
    gpuTiming: 'not measured', geometryBytesEstimate: scene.geometryBytesEstimate, textureBytesEstimate: scene.textureBytesEstimate,
    geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
    grillBytesEstimate: grill.bytesEstimate, grillGeometries: grill.geometries, grillMaterials: grill.materials,
    downloadBytes: performance.getEntriesByType('resource').reduce((sum, resource) => sum + (resource as PerformanceResourceTiming).transferSize, 0),
    playerCount: 4, quality: 'low', camera: grill.camera, daylight: grill.daylight, night: grill.night };
}
