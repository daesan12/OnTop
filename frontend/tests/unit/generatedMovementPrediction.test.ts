import { afterAll, expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';

vi.stubEnv('VITE_PARK_MAP', 'generated');
vi.stubEnv('MODE', 'park-integration');
vi.resetModules();
const { PARK_DATA } = await import('../../src/map/park');
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics');
const { addGeneratedPredictionColliders } = await import('../../src/network/predictionMap');
afterAll(() => vi.unstubAllEnvs());

it('keeps prediction inside the new park instead of clamping its spawn to the legacy park', async () => {
  const simulation = await createPredictionPhysics();
  try {
    const [x, y, z] = PARK_DATA.physics.spawn.position;
    simulation.reset({ x, y, z, yaw: Math.PI }, 0, true);
    for (let i = 0; i < 60; i++) simulation.step({ dx: 0, dz: -1, run: false, jump: false }, 1 / 60);
    const pose = simulation.pose();
    expect(pose.x).toBeCloseTo(x, 2);
    expect(pose.z).toBeLessThan(z - 4);
    expect(pose.z).toBeGreaterThan(z - 8);
    expect(pose.y).toBeGreaterThan(.7);
    expect(pose.y).toBeLessThan(1);
  } finally { simulation.dispose(); }
});

it('uses uninflated handoff shapes and server chair numbers at the new VR table', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const chairs = addGeneratedPredictionColliders(world);
    expect(world.colliders.len()).toBe(PARK_DATA.physics.boxes.length + PARK_DATA.physics.meshes.length + PARK_DATA.physics.hulls.length);
    const chair = chairs.find(c => c.anchor === 'table-17' && c.number === 3)!;
    const box = PARK_DATA.physics.boxes.find(b => b.id === 'table-17-chair-2')!;
    expect(chair.collider.isEnabled()).toBe(false);
    chair.collider.setEnabled(true);
    const actual = chair.collider.halfExtents();
    if (!actual) throw new Error('The handoff chair must remain a cuboid.');
    expect(actual.x).toBeCloseTo(box.half[0], 6);
    expect(actual.y).toBeCloseTo(box.half[1], 6);
    expect(actual.z).toBeCloseTo(box.half[2], 6);
    const position = chair.collider.translation();
    expect([position.x, position.y, position.z]).toEqual(box.center.map(v => Math.fround(v)));
  } finally { world.free(); }
});
