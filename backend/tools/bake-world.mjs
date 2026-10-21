// Node 24+, node --experimental-vm-modules tools/bake-world.mjs <handoff directory>
// The reference TypeScript only runs in a VM without process, filesystem or network APIs.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule, createContext } from 'node:vm';

const root = resolve(process.argv[2]);
const config = resolve(root, 'packages/shared-config/src');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
const context = createContext({});
const modules = new Map();
async function load(path) {
  if (relative(config, path).startsWith('..')) throw Error('Import outside shared config');
  if (modules.has(path)) return modules.get(path);
  const bytes = await readFile(path);
  const entry = manifest.files.find(f => f.path === relative(root, path).replaceAll('\\', '/'));
  if (!entry || entry.sha256 !== digest(bytes) || entry.bytes !== bytes.length) throw Error('Source checksum mismatch');
  const mod = new SourceTextModule(stripTypeScriptTypes(bytes.toString(), { mode: 'transform' }), {
    context, identifier: path,
  });
  modules.set(path, mod);
  return mod;
}
const mod = await load(resolve(config, 'index.ts'));
await mod.link(async (specifier, parent) => {
  if (!specifier.startsWith('./')) throw Error('Only local config imports allowed');
  return load(resolve(dirname(parent.identifier), specifier + '.ts'));
});
await mod.evaluate({ timeout: 10000 });
const c = mod.namespace;
const mesh = (id, data) => ({ id, vertices: Array.from(data.vertices), indices: Array.from(data.indices) });
const boxes = c.WORLD_COLLIDERS.filter(b => !c.staticStructureBatch(b.id)).map(b => {
  const half = [...(b.movementHalf ?? b.half)];
  half[1] = b.movementHeight === undefined ? half[1] : b.movementHeight / 2;
  return { id: b.id, half, center: [b.center[0], b.center[1] - b.half[1] + half[1], b.center[2]], yaw: b.movementYaw ?? 0 };
});
const scene = {
  schemaVersion: 1, sourceSha256: digest(await readFile(resolve(root, 'manifest.json'))),
  units: 'm', upAxis: 'Y', movement: c.MOVEMENT,
  referenceNetwork: { simulationHz: c.NETWORK.simulationHz, patchMs: c.NETWORK.patchMs, staleInputMs: c.NETWORK.staleInputMs },
  world: c.WORLD, spawn: { first: c.spawnPosition(0), columns: 4, spacing: 1.35 },
  lake: c.LAKE, swimming: c.SWIMMING, tower: c.OBSERVATION_TOWER,
  steppingStones: c.STEPPING_STONES, tables: c.TABLES,
  boxes,
  meshes: [mesh('terrain', c.createTerrainMesh()), mesh('pavilion-stairs', c.createPavilionStairs()),
    mesh('tower', c.mergeCollisionMeshes([c.createTowerRamp(), c.createTowerDeck(), c.createTowerRailCollision()])),
    mesh('pavilion-fences', c.boxesToCollisionMesh(c.pavilionFenceBounds()))],
  hulls: c.PARK_PAVILIONS.map(p => {
    const vertices = [];
    for (const y of [p.ground, p.floor]) for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      vertices.push(p.x + Math.cos(a) * c.PAVILION.radius * p.scale, y, p.z + Math.sin(a) * c.PAVILION.radius * p.scale);
    }
    return { id: p.id, vertices };
  }),
};
const json = JSON.stringify(scene);
if (json.includes('null')) throw Error('Unexpected non-finite or missing scene data');
await writeFile(new URL('../src/main/resources/world/park.json', import.meta.url), json + '\n');
console.log(JSON.stringify({ boxes: boxes.length, meshes: scene.meshes.map(m => ({ id: m.id, triangles: m.indices.length / 3 })), hulls: scene.hulls.length, sourceFiles: modules.size }));
