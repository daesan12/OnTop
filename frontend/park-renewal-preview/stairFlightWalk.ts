import { Mesh, Raycaster, Vector3, type Object3D } from 'three'
import { ParkMotion } from '../src/network/parkMotion'
import { groundSurfaceHeight } from './groundSurface'
import { clearMotionSegment } from './motionPlan'
import { FISHING_STAIRS, STATION_STAIRS, bridgeDeckHeight, deckHeightAt, onBridge, facilityGroundY, heightAt, site, type Point } from './plan'
import { STAIR_WALK_TICK } from './stairWalk'
import type { StairFlightId } from './stairFlightOptions'
import { publicAccessRoute } from './publicAccessRoutes'

export type FlightId = Exclude<StairFlightId, 'monument'>
type Flight = { root: string; x: number; z: number; yaw: number; near: number; far: number; ceiling: number; meshes?: RegExp }

function flightDefinition(id: FlightId, scene: Object3D): Flight | undefined {
  const direction = Number(id.at(-1)) * Math.PI / 2
  if (id.startsWith('main-pavilion-')) {
    const p = site('pavilion')
    return { root: 'facility-pavilion', x: p.x, z: p.z, yaw: direction, near: 8.6, far: 14.25,
      ceiling: facilityGroundY(p) + 3.265, meshes: /two_tier_stone_terrace_four_stairs/i }
  }
  if (id.startsWith('pagoda-')) {
    const p = site('pagoda')
    return { root: 'preserved-pagoda-terrace-and-four-stairs', x: p.x, z: p.z, yaw: direction,
      near: 12.7, far: 17.55, ceiling: heightAt(p.x, p.z) + 2.1 }
  }
  if (id === 'balloon') {
    const p = site('balloon')
    return { root: 'balloon-station-model', x: p.x, z: p.z, yaw: 0,
      near: STATION_STAIRS.zTop - .3, far: STATION_STAIRS.zBottom + .5, ceiling: heightAt(p.x, p.z) + 1.3 }
  }
  if (id === 'fishing') {
    const s = FISHING_STAIRS
    return { root: 'native-fishing-district-no-stone-tables', x: s.x, z: 0, yaw: 0,
      near: s.zTop - .45, far: s.zBottom + .55, ceiling: 8.05, meshes: /approved-fishing-deck/ }
  }
  const root = id === 'island-pavilion' ? 'enlarged-island-pavilion' : 'facility-' + id
  const object = scene.getObjectByName(root)
  if (!object) return
  const { x, y, z } = object.position
  return { root, x, z, yaw: object.rotation.y, near: 5.75, far: 9.05, ceiling: y + 1.55,
    meshes: /pavilion-structure|^$/ }
}

export function buildStairFlight(id: FlightId, scene: Object3D) {
  const access = publicAccessRoute(id)
  if (access) {
    const { nodes } = access
    const meshes: Mesh[] = []
    for (const name of access.meshes) {
      const object = scene.getObjectByName(name)
      if (!(object instanceof Mesh)) return
      object.updateWorldMatrix(true, false)
      meshes.push(object)
    }
    const stations = [0]
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1]!, b = nodes[i]!
      stations.push(stations[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]))
    }
    const length = stations.at(-1)!
    function sample(distance: number) {
      const d = Math.max(0, Math.min(length, distance))
      let lo = 0, hi = stations.length - 1
      while (hi - lo > 1) {
        const middle = Math.floor((lo + hi) / 2)
        if (stations[middle]! <= d) lo = middle
        else hi = middle
      }
      const a = nodes[lo]!, b = nodes[hi]!, t = (d - stations[lo]!) / (stations[hi]! - stations[lo]!)
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
      const y = a[2] !== undefined && b[2] !== undefined ? a[2] + (b[2] - a[2]) * t : a[2] ?? b[2]
      return { x, z, y }
    }
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0))
    const hits: Parameters<Mesh['raycast']>[1] = []
    const at = (distance: number): Point => { const { x, z } = sample(distance); return [x, z] }
    const read = (distance: number) => {
      const { x, z, y } = sample(distance)
      const ground = groundSurfaceHeight(x, z)
      if (access.lakeDeck) return onBridge(x, z) ? bridgeDeckHeight(x) : deckHeightAt(x, z) ?? ground
      hits.length = 0
      // Keep the ray close to the intended turn so it cannot hit a higher deck.
      ray.ray.origin.set(x, (y ?? ground) + .6, z)
      for (const mesh of meshes) Mesh.prototype.raycast.call(mesh, ray, hits)
      const surface = hits.reduce((floor, hit) => Math.max(floor, hit.point.y), -Infinity)
      if (Number.isFinite(surface)) return surface
      return ground
    }
    return createWalkProfile(at, read, 0, length, .06, access.lakeDeck ? 1.45 : .8)
  }
  const definition = flightDefinition(id, scene)
  if (!definition) return
  const { root, x, z, yaw, near, far, ceiling, meshes: filter } = definition
  const object = scene.getObjectByName(root)
  if (!object) return
  const meshes: Mesh[] = []
  object.traverse(node => {
    if (node instanceof Mesh && (!filter || filter.test(node.name))) meshes.push(node)
  })
  if (!meshes.length || ((id.startsWith('rest-') || id === 'island-pavilion')
    && !meshes.some(mesh => mesh.name.includes('pavilion-structure')))) return
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  const at = (distance: number): Point => [x + sin * distance, z + cos * distance]
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0))
  const hits: Parameters<Mesh['raycast']>[1] = []
  object.updateWorldMatrix(true, true)
  function renderedFloor(px: number, pz: number) {
    hits.length = 0
    ray.ray.origin.set(px, ceiling, pz)
    // The asset comparison retains old picking geometry. Use the visible mesh here.
    for (const mesh of meshes) Mesh.prototype.raycast.call(mesh, ray, hits)
    return hits.reduce((height, hit) => Math.max(height, hit.point.y), groundSurfaceHeight(px, pz))
  }
  return createWalkProfile(at, distance => renderedFloor(...at(distance)), near, far, .02, .45)
}

function createWalkProfile(
  at: (distance: number) => Point, read: (distance: number) => number,
  near: number, far: number, maxSpacing: number, speed: number,
) {
  const intervals = Math.ceil((far - near) / maxSpacing)
  const spacing = (far - near) / intervals
  const raw = Array.from({ length: intervals + 1 }, (_, i) => read(near + spacing * i))
  // Anticipate each lip by one sample, then join the tread heights with a
  // continuous profile that stays above the rendered steps.
  const support = raw.map((height, i) => Math.max(height, raw[i - 1] ?? height, raw[i + 1] ?? height))
  const risePerSample = 1.2 * spacing
  for (let i = 1; i <= intervals; i++) support[i] = Math.max(support[i]!, support[i - 1]! - risePerSample)
  for (let i = intervals - 1; i >= 0; i--) support[i] = Math.max(support[i]!, support[i + 1]! - risePerSample)
  const floor = (distance: number) => {
    const sample = Math.max(0, Math.min(intervals, (distance - near) / spacing))
    const index = Math.min(intervals - 1, Math.floor(sample)), t = sample - index
    return support[index]! + t * (support[index + 1]! - support[index]!)
  }
  const heading = (distance: number) => {
    const a = at(Math.max(near, distance - .1)), b = at(Math.min(far, distance + .1))
    return Math.atan2(b[0] - a[0], b[1] - a[1])
  }
  return { at, floor, read, near, far, heading, speed, raw }
}

export function createFlightWalker(flight: NonNullable<ReturnType<typeof buildStairFlight>>) {
  return { distance: flight.far, motion: new ParkMotion(), blocked: 0 }
}

export function stepFlightWalker(
  actor: ReturnType<typeof createFlightWalker>,
  flight: NonNullable<ReturnType<typeof buildStairFlight>>,
  direction: number,
) {
  const yaw = flight.heading(actor.distance), sin = Math.sin(yaw), cos = Math.cos(yaw)
  const motion = actor.motion.advance({ dx: sin * direction * flight.speed, dz: cos * direction * flight.speed, run: false, jump: false }, STAIR_WALK_TICK, true)
  const next = Math.max(flight.near, Math.min(flight.far, actor.distance + motion.x * sin + motion.z * cos))
  const from = flight.at(actor.distance), to = flight.at(next)
  const foot = flight.floor(actor.distance)
  if (!clearMotionSegment(from, to, foot)) {
    actor.motion.stopHorizontal()
    actor.blocked++
    return 0
  }
  const distance = next - actor.distance
  actor.distance = next
  return Math.abs(distance)
}
