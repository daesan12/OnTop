// Dev-server-only visual inspection of the current generated park.
import { _roots } from '@react-three/fiber'
import { PARK_PAVILIONS } from '../../src/park/mapConfig'
import { Mesh, MeshStandardMaterial, Raycaster, Vector3, Box3 } from 'three'
import { pavilionLanternLayout } from '../../src/world/art/pavilionLanternLayout'
import { PAVILION_CANOPY } from '../../src/world/art/pavilionCanopy'
let release: (() => void) | undefined
export function pavilionView(id: string, view: 'inside' | 'outside' | 'bench' | 'hanger' = 'inside') {
  release?.()
  const p = PARK_PAVILIONS.find(p => p.id === id)!
  const store = _roots.get(document.querySelector('canvas')!)!.store
  release = store.getState().internal.subscribe({ current: ({ camera }) => {
    if (view === 'hanger') {
      const lamp = pavilionLanternLayout([p]).placements[0]!
      camera.position.set(p.x + .35, lamp.p[1] + 1.05, p.z + .85)
      camera.lookAt(p.x, lamp.p[1] + 1.02, p.z)
    } else if (view === 'outside') {
      camera.position.set(p.x + 6 * p.scale, p.floor + 4 * p.scale, p.z + 8 * p.scale)
      camera.lookAt(p.x, p.floor + 2.3 * p.scale, p.z)
    } else if (view === 'bench') {
      camera.position.set(p.x, p.floor + 1.6, p.z - .3 * p.scale)
      camera.lookAt(p.x + 2 * p.scale, p.floor + .7, p.z - 2.2 * p.scale)
    } else {
      camera.position.set(p.x, p.floor + 1.7, p.z + 3.6 * p.scale)
      camera.lookAt(p.x, p.floor + 2.8 * p.scale, p.z)
    }
    camera.updateMatrixWorld()
  } }, .5, store)
}
export function releasePavilionView() { release?.(); release = undefined }

export function pavilionHangerConnected(id: string) {
  const { scene } = _roots.get(document.querySelector('canvas')!)!.store.getState()
  scene.updateMatrixWorld(true)
  const p = PARK_PAVILIONS.find(p => p.id === id)!
  const lamp = pavilionLanternLayout([p]).placements[0]!
  const stem = scene.getObjectByName('lantern-simple-chains')!
  const ray = new Raycaster()
  // Probe the actual stem inside the hanging eye, not the ring's outer rim.
  return [.905, .915, .925, .935, .945].map(y => {
    ray.set(new Vector3(p.x + .1, lamp.p[1] + y, p.z), new Vector3(-1, 0, 0))
    ray.far = .2
    return ray.intersectObject(stem).length > 0
  })
}

export function pavilionClearance() {
  const { scene } = _roots.get(document.querySelector('canvas')!)!.store.getState()
  scene.updateMatrixWorld(true)
  const ray = new Raycaster(), layout = pavilionLanternLayout(PARK_PAVILIONS)
  const gaps = layout.placements.map((lamp, i) => {
    const p = i < PARK_PAVILIONS.length ? PARK_PAVILIONS[i]! : PARK_PAVILIONS.find(p => p.id === 'P0')!
    let ceiling: Mesh | undefined
    scene.getObjectByName(`pavilion-${p.id}`)!.traverse(object => {
      if (!(object instanceof Mesh)) return
      const parameters = (object.geometry as { parameters?: { radiusTop?: number; height?: number } }).parameters
      if (parameters?.radiusTop === PAVILION_CANOPY.ceilingRadius && parameters?.height === PAVILION_CANOPY.ceilingHeight) ceiling = object
    })
    if (!ceiling) throw new Error(`Original pavilion ceiling not found: ${p.id}`)
    const bounds = new Box3().setFromObject(ceiling)
    ray.set(new Vector3(lamp.p[0], lamp.p[1] + .968 * lamp.s[1], lamp.p[2]), new Vector3(0, 1, 0))
    const hits = ray.intersectObject(ceiling)
    return { gap: bounds.min.y - ray.ray.origin.y, supported: hits.length > 0,
      cap: layout.chainCaps[i]!.p[1] - bounds.min.y }
  })
  const tile = scene.getObjectByName('lantern-tile') as Mesh
  const roof = new Mesh(tile.geometry, tile.material)
  ray.set(new Vector3(.2, .65, 0), new Vector3(0, 1, 0))
  const underside = ray.intersectObject(roof).length > 0
  const wood = scene.getObjectByName('lantern-wood') as Mesh
  const ribs = new Mesh(wood.geometry, wood.material)
  ray.set(new Vector3(0, 1, .38), new Vector3(0, -1, 0))
  const connectedTip = ray.intersectObject(ribs).length > 0
  const glow = scene.getObjectByName('lantern-glow') as Mesh
  return { gaps, underside, connectedTip, emission: (glow.material as MeshStandardMaterial).emissiveIntensity }
}
