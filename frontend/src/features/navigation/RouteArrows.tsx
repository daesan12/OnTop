import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, MeshBasicMaterial, Object3D, Raycaster, Shape, ShapeGeometry, Vector3 } from 'three'
import { avatars, useSession } from '../../network/worldClient'
import { useNavigation } from './navigationState'
import { navigationHeight } from './parkNavigation'

/** Chevrons painted on the ground along the planned route; only this player sees them. */
const ARROWS = { count: 40, spacing: 1.6, speed: 1.1, lift: 0.04, size: 0.95, outline: 1.22, fade: 1.4, reach: 40 }

function chevron() {
  const s = ARROWS.size, shape = new Shape()
  shape.moveTo(0, s * 0.5)
  shape.lineTo(s * 0.5, 0)
  shape.lineTo(s * 0.5, -s * 0.3)
  shape.lineTo(0, s * 0.2)
  shape.lineTo(-s * 0.5, -s * 0.3)
  shape.lineTo(-s * 0.5, 0)
  shape.closePath()
  // Lay it flat with the tip pointing along -z, the yaw-zero walking direction below.
  return new ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

const down = new Raycaster(), from = new Vector3(), below = new Vector3(0, -1, 0)
/** Paving, steps and bridge decks sit above the terrain height the planner uses; a short ray finds the top.
 * Cached on a 0.5 m grid, so drifting arrows cost a ray only when they enter a new cell. */
function surfaceHeight(park: Object3D | undefined, cache: Map<string, number>, x: number, z: number) {
  const key = `${Math.round(x * 2)},${Math.round(z * 2)}`, known = cache.get(key)
  if (known !== undefined) return known
  const terrain = navigationHeight({ x, z })
  let height = terrain
  if (park) {
    down.set(from.set(x, terrain + 1, z), below)
    down.far = 1.6
    // Instanced scatter (grass tufts, flowers, pebbles) is not something to walk on.
    height = down.intersectObject(park, true).find(hit => hit.object.visible && !(hit.object instanceof InstancedMesh))?.point.y ?? terrain
  }
  cache.set(key, height)
  return height
}

function layer(geometry: ShapeGeometry, name: string, color: string, opacity: number, order: number) {
  const arrows = new InstancedMesh(geometry, new MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  }), ARROWS.count)
  arrows.name = name
  arrows.frustumCulled = false
  arrows.renderOrder = order
  arrows.count = 0
  return arrows
}

export function RouteArrows() {
  // A bright chevron over a slightly larger dark one, so it reads on light paving and on grass alike.
  const { fill, edge } = useMemo(() => {
    const geometry = chevron()
    return { fill: layer(geometry, 'navigation-route-arrows', '#3fe0d0', 0.95, 3), edge: layer(geometry, 'navigation-route-arrow-edges', '#0d4b45', 0.55, 2) }
  }, [])
  const place = useMemo(() => new Object3D(), [])
  const heights = useMemo(() => ({ path: null as unknown, cells: new Map<string, number>() }), [])
  useEffect(() => () => {
    fill.geometry.dispose()
    for (const mesh of [fill, edge]) { (mesh.material as MeshBasicMaterial).dispose(); mesh.dispose() }
  }, [fill, edge])
  useFrame(({ clock, scene }) => {
    const { path, status } = useNavigation.getState(), session = useSession.getState()
    const pose = avatars.get(session.sessionId)?.current
    fill.count = edge.count = 0
    // While a new route is being planned, the previous one stays visible until it is replaced.
    if ((status !== 'guiding' && status !== 'planning') || path.length < 2 || !pose || session.tableId || session.benchId || session.fitnessId || session.telescopeId) return
    if (heights.path !== path) { heights.path = path; heights.cells.clear() }
    const park = scene.getObjectByName('placeholder-park')
    // Start from the player's foot point on the route, so walked parts drop away.
    let segment = 0, along = 0, best = Infinity
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!, b = path[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1
      const t = Math.max(0, Math.min(length, ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / length))
      const distance = Math.hypot(a.x + dx / length * t - pose.x, a.z + dz / length * t - pose.z)
      if (distance < best) { best = distance; segment = i; along = t }
    }
    let total = 0
    for (let i = segment; i < path.length - 1; i++) total += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.z - path[i]!.z)
    total -= along
    // Arrows drift forward so the route reads as a direction, not just a line.
    const phase = (clock.elapsedTime * ARROWS.speed) % ARROWS.spacing
    let i = segment, start = along, travelled = 0, n = 0
    for (let at = phase + ARROWS.spacing * 0.5; at < Math.min(total, ARROWS.reach) && n < ARROWS.count; at += ARROWS.spacing) {
      while (i < path.length - 1) {
        const length = Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.z - path[i]!.z)
        if (at - travelled <= length - start) break
        travelled += length - start; start = 0; i++
      }
      if (i >= path.length - 1) break
      const a = path[i]!, b = path[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1
      const t = start + at - travelled, x = a.x + dx / length * t, z = a.z + dz / length * t
      const scale = Math.min(1, at / ARROWS.fade, (total - at) / ARROWS.fade, (ARROWS.reach - at) / ARROWS.fade)
      place.position.set(x, surfaceHeight(park, heights.cells, x, z) + ARROWS.lift, z)
      place.rotation.set(0, Math.atan2(-dx, -dz), 0)
      place.scale.setScalar(Math.max(0.05, scale))
      place.updateMatrix()
      fill.setMatrixAt(n, place.matrix)
      place.scale.multiplyScalar(ARROWS.outline)
      place.position.y -= 0.005
      place.updateMatrix()
      edge.setMatrixAt(n++, place.matrix)
    }
    fill.count = edge.count = n
    fill.instanceMatrix.needsUpdate = edge.instanceMatrix.needsUpdate = true
  })
  return <><primitive object={edge} /><primitive object={fill} /></>
}
