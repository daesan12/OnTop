import { _roots } from '@react-three/fiber'
import { Box3, Vector3 } from 'three'

/** Project the rendered tray; no camera or game state mutations. */
export function spectatorTrayBounds() {
  const canvas = document.querySelector('canvas')!, state = _roots.get(canvas)!.store.getState()
  const tray = state.scene.getObjectByName('farkle-oak-tray')!
  const box = new Box3().setFromObject(tray), rect = canvas.getBoundingClientRect()
  const points = [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => {
    const p = new Vector3(x, y, z).project(state.camera)
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }
  })))
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x))
  return { left, right, top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)), width: right - left }
}
