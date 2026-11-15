import RAPIER from '@dimforge/rapier3d-compat';
import { PARK_DATA } from '../map/park';

/** Use the exact uninflated 3D handoff, never legacy geometry or preview 2D clearance. */
export function addGeneratedPredictionColliders(world: RAPIER.World,
  physics: typeof PARK_DATA.physics & { secretTerrainCuts?: readonly number[] } = PARK_DATA.physics, secretDoors?: RAPIER.Collider[]) {
  const chairs: { anchor: string; number: number; collider: RAPIER.Collider }[] = [];
  for (const box of physics.boxes) {
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(...box.half)
      .setTranslation(...box.center)
      .setRotation({ x: 0, y: Math.sin(box.yaw / 2), z: 0, w: Math.cos(box.yaw / 2) }));
    if (box.id.startsWith('secret-door-')) secretDoors?.push(collider);
    // Match the server's chair-ID contract; other physical pieces remain static.
    const chair = /(.+)-chair-([0-7])$/.exec(box.id);
    if (chair) {
      const number = Number(chair[2]) + 1;
      collider.setEnabled(number <= 2);
      chairs.push({ anchor: chair[1]!, number, collider });
    }
  }
  for (const mesh of physics.meshes) {
    const cuts = mesh.id === physics.terrain.meshId && physics.secretTerrainCuts
      ? new Set(physics.secretTerrainCuts) : null;
    const indices = cuts ? mesh.indices.filter((_, i) => !cuts.has(Math.floor(i / 3))) : mesh.indices;
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(mesh.vertices), new Uint32Array(indices)));
  }
  for (const hull of physics.hulls) {
    const shape = RAPIER.ColliderDesc.convexHull(new Float32Array(hull.vertices));
    if (!shape) throw new Error('새 맵의 예측 충돌 지형을 구성할 수 없습니다.');
    world.createCollider(shape);
  }
  return chairs;
}
