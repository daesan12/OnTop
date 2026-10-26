import {
  WORLD_COLLIDERS,
  WORLD,
  MOVEMENT,
  PARK_PAVILIONS,
  OBSERVATION_TOWER,
  groundHeight,
  lakeRadiusAt,
  BRIDGE,
  isOnParkWalkway,
  PARK_ZONES, FITNESS_AREA, VR_ZONE, FOUNTAIN, MAILBOX, MINI_PROPS, LAKE, GARDEN_PAGODA,
  pavilionStairJoin,
} from "../../config";

export type NavPoint = { x: number; z: number };
export type Destination = NavPoint & { name: string };
/** Arrival points are accessible approaches, rather than the centres of solid props. */
const main = PARK_PAVILIONS[0];
/** Approaches derive from the current OnTop layout, never a prototype zone centre. */
export const PARK_DESTINATIONS: Record<string, NavPoint> = {
  central: { x: main.x, z: main.z + pavilionStairJoin(main.scale) + Math.ceil((main.floor-main.ground)/0.18)*0.5 + 0.65 },
  "games-west": { x: PARK_ZONES[1].x, z: PARK_ZONES[1].z },
  "games-east": { x: PARK_ZONES[2].x, z: PARK_ZONES[2].z },
  lake: { x: LAKE.x-LAKE.radiusX-2, z: LAKE.z-12 },
  tower: { x: OBSERVATION_TOWER.x+OBSERVATION_TOWER.outer+1.5, z: OBSERVATION_TOWER.z },
  fitness: { x: FITNESS_AREA.x, z: FITNESS_AREA.z+FITNESS_AREA.depth/2-4 },
  mini: { x: MINI_PROPS[0].x, z: MINI_PROPS[0].z+MINI_PROPS[0].depth/2+1.8 },
  vr: { x: VR_ZONE.x, z: VR_ZONE.z+VR_ZONE.depth/2+1 },
  fountain: { x: FOUNTAIN.x, z: FOUNTAIN.z+FOUNTAIN.plazaRadius+1 },
  mailbox: { x: MAILBOX.x, z: MAILBOX.z+1.5 },
  pagoda: { x: GARDEN_PAGODA.x, z: GARDEN_PAGODA.z+GARDEN_PAGODA.plazaWidth/2+3.4 },
};
export const navDistance = (a: NavPoint, b: NavPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const clearance = MOVEMENT.radius + 0.09;
const bucketSize = 8;
const buckets = new Map<string, (typeof WORLD_COLLIDERS)[number][]>();
for (const box of WORLD_COLLIDERS) {
  if (box.id === "ground") continue;
  const half = box.movementHalf ?? box.half;
  const r = Math.hypot(half[0], half[2]) + clearance;
  for (
    let x = Math.floor((box.center[0] - r) / bucketSize);
    x <= Math.floor((box.center[0] + r) / bucketSize);
    x++
  ) {
    for (
      let z = Math.floor((box.center[2] - r) / bucketSize);
      z <= Math.floor((box.center[2] + r) / bucketSize);
      z++
    ) {
      const key = `${x},${z}`;
      const list = buckets.get(key) ?? [];
      list.push(box);
      buckets.set(key, list);
    }
  }
}
function nearby(p: NavPoint) {
  return (
    buckets.get(
      `${Math.floor(p.x / bucketSize)},${Math.floor(p.z / bucketSize)}`,
    ) ?? []
  );
}
function inside(
  p: NavPoint,
  box: (typeof WORLD_COLLIDERS)[number],
  padding: number,
) {
  const half = box.movementHalf ?? box.half,
    yaw = box.movementYaw ?? 0;
  const dx = p.x - box.center[0],
    dz = p.z - box.center[2];
  return (
    Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) < half[0] + padding &&
    Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) < half[2] + padding
  );
}
export function navigationHeight(p: NavPoint): number {
  let height = groundHeight(p.x, p.z);
  for (const pavilion of PARK_PAVILIONS) {
    const dx = Math.abs(p.x - pavilion.x),
      dz = Math.abs(p.z - pavilion.z);
    if (
      Math.max(dx, dz, (dx + dz) / Math.SQRT2) <
      4.5 * pavilion.scale * Math.cos(Math.PI / 8)
    )
      height = Math.max(height, pavilion.floor);
  }
  for (const box of nearby(p)) {
    if (
      (box.id.includes("-step-") ||
        box.id.startsWith("bridge-deck-") ||
        box.id === "vr-apron") &&
      inside(p, box, 0)
    )
      height = Math.max(height, box.center[1] + box.half[1]);
  }
  return height;
}
export function isNavigationWalkable(p: NavPoint): boolean {
  if (
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.z) ||
    Math.max(Math.abs(p.x), Math.abs(p.z)) > WORLD.halfSize - 1
  )
    return false;
  // Multi-storey tower ramps cannot be represented safely by a single ground plane.
  if (navDistance(p, OBSERVATION_TOWER) < OBSERVATION_TOWER.outer + 0.5)
    return false;
  const bridge =
    p.x >= BRIDGE.startX &&
    p.x <= BRIDGE.endX &&
    Math.abs(p.z - BRIDGE.z) < BRIDGE.halfWidth - clearance;
  if (lakeRadiusAt(p.x, p.z) < 1.01 && !bridge) return false;
  const floor = navigationHeight(p);
  return !nearby(p).some((box) => {
    const bottom = box.center[1] - box.half[1];
    const top = bottom + (box.movementHeight ?? box.half[1] * 2);
    return (
      top > floor + MOVEMENT.stepHeight + 0.01 &&
      bottom < floor + 1.6 &&
      inside(p, box, clearance)
    );
  });
}
export function navigationSegmentClear(a: NavPoint, b: NavPoint): boolean {
  const steps = Math.max(1, Math.ceil(navDistance(a, b) / 0.16));
  let previous = navigationHeight(a);
  for (let i = 0; i <= steps; i++) {
    const p = {
      x: a.x + ((b.x - a.x) * i) / steps,
      z: a.z + ((b.z - a.z) * i) / steps,
    };
    const y = navigationHeight(p);
    if (
      !isNavigationWalkable(p) ||
      Math.abs(y - previous) > MOVEMENT.stepHeight + 0.025
    )
      return false;
    previous = y;
  }
  return true;
}
const step = 0.75,
  edge = WORLD.halfSize - 2,
  width = Math.round(edge * 2 / step) + 1,
  count = width * width;
const point = (id: number): NavPoint => ({
  x: (id % width) * step - edge,
  z: Math.floor(id / width) * step - edge,
});
const idAt = (p: NavPoint) =>
  Math.round((p.z + edge) / step) * width + Math.round((p.x + edge) / step);
const validity = new Int8Array(count);
const edgeCache = new Map<string, boolean>();
function valid(id: number) {
  if (id < 0 || id >= count) return false;
  if (!validity[id]) validity[id] = isNavigationWalkable(point(id)) ? 1 : -1;
  return validity[id] === 1;
}
function connected(a: number, b: number) {
  const key = `${Math.min(a, b)},${Math.max(a, b)}`;
  let value = edgeCache.get(key);
  if (value === undefined) {
    value = navigationSegmentClear(point(a), point(b));
    edgeCache.set(key, value);
  }
  return value;
}
function nearest(p: NavPoint, radius: number, requireConnection: boolean) {
  const centre = idAt(p),
    candidates: number[] = [];
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const id = centre + dz * width + dx;
      if (valid(id) && navDistance(p, point(id)) <= radius * step)
        candidates.push(id);
    }
  return candidates
    .sort((a, b) => navDistance(p, point(a)) - navDistance(p, point(b)))
    .find((id) => !requireConnection || navigationSegmentClear(p, point(id)));
}
/** Cached static grid; called on selection or deviation, never from the render loop. */
export function findParkRoute(
  start: NavPoint,
  destination: NavPoint,
): NavPoint[] | null {
  if (![start.x,start.z,destination.x,destination.z].every(Number.isFinite) || !isNavigationWalkable(start)) return null;
  if (
    Math.max(Math.abs(destination.x), Math.abs(destination.z)) > edge ||
    (lakeRadiusAt(destination.x, destination.z) < 1.01 &&
      !isNavigationWalkable(destination))
  )
    return null;
  const from = nearest(start, 3, true),
    to = nearest(destination, 4, isNavigationWalkable(destination));
  if (from === undefined || to === undefined) return null;
  const costs = new Float64Array(count).fill(Infinity),
    parent = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count),
    heap: { id: number; score: number }[] = [];
  function push(id: number, score: number) {
    let i = heap.length;
    heap.push({ id, score });
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].score <= score) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = { id, score };
  }
  function pop() {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (last.score <= heap[child].score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first.id;
  }
  costs[from] = 0;
  push(from, navDistance(point(from), point(to)));
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === to) {
      const route: NavPoint[] = [];
      let cursor = to;
      while (cursor !== -1) {
        route.push(point(cursor));
        cursor = parent[cursor];
      }
      route.reverse();
      // Avatar poses are mutable renderer refs; a route must retain its planned origin.
      route.unshift({ x: start.x, z: start.z });
      if (
        isNavigationWalkable(destination) &&
        navigationSegmentClear(route.at(-1)!, destination)
      )
        route.push(destination);
      return route;
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const next = current + dz * width + dx;
        if (
          closed[next] ||
          !valid(next) ||
          Math.abs((next % width) - (current % width)) > 1 ||
          !connected(current, next)
        )
          continue;
        const p = point(next);
        const onBridge =
          p.x >= BRIDGE.startX &&
          p.x <= BRIDGE.endX &&
          Math.abs(p.z - BRIDGE.z) < BRIDGE.halfWidth;
        const cost =
          costs[current] +
          Math.hypot(dx, dz) *
            step *
            (onBridge || isOnParkWalkway(p.x, p.z) ? 1 : 1.8);
        if (cost >= costs[next]) continue;
        costs[next] = cost;
        parent[next] = current;
        push(next, cost + navDistance(p, point(to)));
      }
  }
  return null;
}
