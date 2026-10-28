// Dev-server QA only. Never imported by the product bundle.
import { _roots } from '@react-three/fiber';
import { Box3, Mesh, PointLight, Raycaster, SkinnedMesh, Vector3, type InstancedMesh, type Object3D } from 'three';
import { slotScreen } from '../../src/features/bungeoppang/bungeoppangView';
import { customerPoint, trayPoint } from '../../src/features/bungeoppang/layoutV5';
import { useBungeoppang } from '../../src/features/bungeoppang/store';
import { environmentFrame } from '../../src/world/environmentState';
export function v5Probe() {
  const { scene, camera, gl } = [..._roots.values()][0]!.store.getState();
  const project = (p: [number, number, number]) => {
    const v = new Vector3(...p).project(camera), rect = gl.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 };
  };
  const s = useBungeoppang.getState();
  const dom = (element: Element | null) => {
    const r = element?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: -1, y: -1 };
  };
  const people: string[] = [], stock: string[] = [];
  scene.getObjectByName('bungeoppang-render-root')?.traverse(o => {
    if (o.name.startsWith('bungeoppang-customer-')) people.push(o.name);
    if (o.name === 'bungeoppang-stock')
      stock.push(...((o.userData.breadIds ?? []) as number[]).map(id => `bread-${id}`));
  });
  return { phase: s.phase, grill: s.grill, tool: s.tool, result: s.result, selectedCustomer: s.selectedCustomer,
    people, stock, stockInstances: (scene.getObjectByName('bungeoppang-stock') as InstancedMesh | undefined)?.count,
    burners: scene.getObjectByName('bungeoppang-burners')?.userData.burners ?? [],
    ui: document.querySelector('.bung25-top') ? {
      tools: [...document.querySelectorAll('.bung25-tools button')].map(dom), waste: dom(document.querySelector('.bung25-waste-select')),
      orders: [...document.querySelectorAll('.bung25-order')].map(el => ({ select: dom(el.querySelector('.bung25-select')),
        deliver: dom(el.querySelector('.bung25-deliver')), bounds: (() => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })() })),
      heat: [...document.querySelectorAll('.bung25-cell-meter')].map(dom),
      clock: dom(document.querySelector('.bung25-time')),
      help: dom(document.querySelector('.bung-help-button')),
      slots: slotScreen.map(p => ({ x: p.x, y: p.y })),
    } : null,
    trash: dom(document.querySelector('.bung25-trash')), tray: [...document.querySelectorAll('.bung25-stock li button')].map(dom),
    customers: [0, 1, 2].map(i => project(customerPoint(i))), calls: gl.info.render.calls,
    triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
    privatePresent: !!scene.getObjectByName('bungeoppang-v5-private') };
}
let disposal = { tracked: 0, disposed: 0 };
export function watchV5Disposal() {
  disposal = { tracked: 0, disposed: 0 };
  const watched = new Set<unknown>();
  const { scene } = [..._roots.values()][0]!.store.getState();
  scene.getObjectByName('bungeoppang-render-root')?.traverse(o => {
    if (!(o instanceof Mesh)) return;
    for (const value of [o.geometry, ...Array.isArray(o.material) ? o.material : [o.material]]) {
      if (watched.has(value)) continue;
      watched.add(value); disposal.tracked++;
      value.addEventListener('dispose', () => { disposal.disposed++; });
    }
  });
  return disposal;
}
export const disposalProbe = () => ({ ...disposal });
export function customerAnimationProbe() {
  const { scene, camera, gl } = [..._roots.values()][0]!.store.getState();
  const root = scene.getObjectByName('bungeoppang-npc-actors');
  return (root?.children ?? []).map(actor => {
    const skins: { bones: number; pose: number[] }[] = [];
    actor.traverse(object => {
      if (object instanceof SkinnedMesh) skins.push({ bones: object.skeleton.bones.length,
        pose: object.skeleton.bones.flatMap(bone => bone.quaternion.toArray()) });
    });
    const bounds = new Box3().setFromObject(actor);
    const head = bounds.getCenter(new Vector3()); head.y = bounds.max.y - .18;
    head.project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    return { name: actor.name, orderId: String(actor.userData.orderId), lookId: String(actor.userData.lookId),
      loaded: Boolean(actor.userData.loaded), visible: actor.visible, arrived: Boolean(actor.userData.arrived), motion: String(actor.userData.motion),
      animationTime: Number(actor.userData.animationTime), skins, position: actor.position.toArray(),
      head: { x: rect.left + (head.x + 1) * rect.width / 2, y: rect.top + (1 - head.y) * rect.height / 2 } };
  });
}
export function stage25Probe() {
  const { scene } = [..._roots.values()][0]!.store.getState();
  return { stage: !!scene.getObjectByName('bungeoppang-cooking-stage'), oldControls: !!scene.getObjectByName('bungeoppang-world-controls'),
    sprites: [0, 1, 2, 3, 4, 5].every(i => !!scene.getObjectByName(`bungeoppang-food-25d-${i}`)) };
}

export function cookingLightingProbe(visible?: boolean) {
  const { scene, gl } = [..._roots.values()][0]!.store.getState();
  const root = scene.getObjectByName('bungeoppang-cooking-lights');
  if (root && visible !== undefined) root.visible = visible;
  return { exposure: gl.toneMappingExposure, daylight: environmentFrame.daylight, lights: (root?.children ?? [])
    .filter((object): object is PointLight => object instanceof PointLight)
    .map(light => ({ intensity: light.intensity, distance: light.distance, shadow: light.castShadow })) };
}

const solidVisible = (o: Object3D) => {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return o instanceof Mesh && (Array.isArray(o.material) ? o.material : [o.material]).some(m => m.visible && !m.transparent);
};
export function stockSightlines() {
  const { scene, camera } = [..._roots.values()][0]!.store.getState();
  const root = scene.getObjectByName('bungeoppang-v5-private')!;
  return Array.from({ length: 10 }, (_, i) => {
    const target = new Vector3(...trayPoint(i)); target.y += .015;
    const ray = new Raycaster(camera.position, target.sub(camera.position).normalize());
    const hit = ray.intersectObject(root, true).find(h => solidVisible(h.object));
    return { index: i, name: hit?.object.name, instance: hit?.instanceId,
      visible: (hit?.object.name === 'bungeoppang-stock' || hit?.object.name === 'bungeoppang-stock-markers') && hit.instanceId === i };
  });
}
