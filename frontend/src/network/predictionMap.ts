import RAPIER from '@dimforge/rapier3d-compat';
import { PARK_DATA } from '../map/park';

/** Use the exact uninflated 3D handoff, never legacy geometry or preview 2D clearance. */
export function addGeneratedPredictionColliders(world: RAPIER.World,
  physics: typeof PARK_DATA.physics & { secretTerrainCuts?: readonly number[] } = PARK_DATA.physics,
  secretDoors?: RAPIER.Collider[],
  landing?: { colliderIds: readonly string[]; supports: Set<RAPIER.Collider> }) {
  const chairs: { anchor: string; number: number; collider: RAPIER.Collider }[] = [];
  const pendingLandingIds = new Set(landing?.colliderIds);
  const registerLanding = (id: string, collider: RAPIER.Collider) => {
    if (pendingLandingIds.delete(id)) landing?.supports.add(collider);
  };
  for (const box of physics.boxes) {
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(...box.half)
      .setTranslation(...box.center)
      .setRotation({ x: 0, y: Math.sin(box.yaw / 2), z: 0, w: Math.cos(box.yaw / 2) }));
    if (box.id.startsWith('secret-door-')) secretDoors?.push(collider);
    registerLanding(box.id, collider);
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
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(mesh.vertices), new Uint32Array(indices)));
    registerLanding(mesh.id, collider);
  }
  for (const hull of physics.hulls) {
    const shape = RAPIER.ColliderDesc.convexHull(new Float32Array(hull.vertices));
    if (!shape) throw new Error('새 맵의 예측 충돌 지형을 구성할 수 없습니다.');
    registerLanding(hull.id, world.createCollider(shape));
  }
  if (pendingLandingIds.size) {
    throw new Error(`점프맵 착지 콜라이더를 찾을 수 없습니다: ${[...pendingLandingIds].join(', ')}`);
  }
  return chairs;
}
