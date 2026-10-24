// Read-only FE config evaluation; only placements matching the current BE collision map are exported.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule, createContext } from 'node:vm';
import { createHash } from 'node:crypto';

const config = resolve(import.meta.dirname, '../../frontend/src/config');
const map = JSON.parse(await readFile(new URL('../src/main/resources/world/park.json', import.meta.url)));
const modules = new Map(), context = createContext({});
async function load(file) {
  if (relative(config, file).startsWith('..')) throw Error('Config import escapes root');
  if (!modules.has(file)) {
    const source = await readFile(file, 'utf8');
    modules.set(file, new SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }), {
      context, identifier: file,
    }));
  }
  return modules.get(file);
}
const entry = await load(resolve(config, 'index.ts'));
await entry.link((specifier, parent) => {
  if (!specifier.startsWith('./')) throw Error('Only config imports allowed');
  return load(resolve(dirname(parent.identifier), specifier + '.ts'));
});
await entry.evaluate({ timeout: 10000 });
const c = entry.namespace, facilities = [], excluded = [];
const pose = (x, y, z, yaw) => ({ x, y, z, yaw });
function add(id, kind, center, radius, seats, exit) {
  const box = map.boxes.find(b => b.id === id), fe = c.WORLD_COLLIDERS.find(b => b.id === id);
  const half = fe && [...(fe.movementHalf ?? fe.half)];
  if (fe?.movementHeight !== undefined) half[1] = fe.movementHeight / 2;
  const expectedCenter = fe && [fe.center[0], fe.center[1] - fe.half[1] + half[1], fe.center[2]];
  if (!box || !fe || [...box.center, ...box.half, box.yaw].some((v, i) =>
    Math.abs(v - [...expectedCenter, ...half, fe.movementYaw ?? 0][i]) > 1e-6)) {
    excluded.push(id);
    return;
  }
  facilities.push({ facilityId: id, kind, center, radius, heightTolerance: 0.7, seats, exit });
}
c.BENCHES.forEach((p, i) => {
  const yaw = c.BENCH_YAWS[i] ?? 0, d = c.BENCH_PAVILIONS[i] ? c.PAVILION_BENCH_EXIT : 1.5;
  add(`bench-${i}`, 'BENCH', pose(p[0], p[1] + 0.8, p[2], yaw), 3,
    [0, 1].map(s => pose(p[0] + Math.cos(yaw) * (s ? 0.65 : -0.65) + Math.sin(yaw) * 0.07,
      p[1] + 0.8, p[2] - Math.sin(yaw) * (s ? 0.65 : -0.65) + Math.cos(yaw) * 0.07, yaw)),
    pose(p[0] + Math.sin(yaw) * d, p[1] + 0.8, p[2] + Math.cos(yaw) * d, yaw));
});
c.FITNESS_STATIONS.forEach(s => add(s.id, 'FITNESS', pose(s.position[0], s.position[1] + 0.8, s.position[2], s.yaw),
  c.FITNESS.interactionRadius, [pose(s.position[0], s.position[1] + s.baseHeight + 0.8, s.position[2], s.yaw)],
  pose(s.position[0] - Math.sin(s.yaw) * c.FITNESS.exitOffset,
    s.position[1] + c.FITNESS.padSurfaceHeight + 0.8,
    s.position[2] - Math.cos(s.yaw) * c.FITNESS.exitOffset, s.yaw)));
c.TELESCOPES.forEach(t => add(t.id, 'TELESCOPE', pose(t.position[0], t.position[1] + 0.8, t.position[2], t.yaw),
  c.TELESCOPE.interactionRadius, [pose(...c.telescopeLanding(t), t.yaw)], pose(...c.telescopeLanding(t, true), t.yaw)));
const sourceSha256 = createHash('sha256');
for (const file of [...modules.keys()].sort()) sourceSha256.update(await readFile(file));
const result = { mapVersion: map.sourceSha256, configSha256: sourceSha256.digest('hex'),
  aimIntervalMs: c.TELESCOPE.aimIntervalMs, minPitch: c.TELESCOPE.minPitch,
  maxPitch: c.TELESCOPE.maxPitch, initialPitch: c.TELESCOPE.initialPitch, facilities, excluded };
const output = JSON.stringify(result, null, 2) + '\n';
const url = new URL('../src/main/resources/world/facilities.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(url, 'utf8') !== output) throw Error('Facility catalog is stale');
} else await writeFile(url, output);
console.log(JSON.stringify({ facilities: facilities.length, excluded, mapVersion: result.mapVersion }));
