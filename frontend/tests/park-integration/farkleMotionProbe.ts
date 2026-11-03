import { _roots } from '@react-three/fiber'
import { Vector3 } from 'three'

/** Read-only inspection of presentation meshes, separate from confirmed result faces. */
export function farkleMotionProbe() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  const rolling: { name: string; visible: boolean; rotation: number[] }[] = []
  state.scene.traverse(object => {
    if (object.name.startsWith('farkle-rolling-die-')) rolling.push({ name: object.name, visible: object.visible, rotation: object.quaternion.toArray() })
  })
  return { rolling }
}

export function pointForFarkleProp(name: string, offset: [number, number, number] = [0, 0, 0]) {
  const canvas = document.querySelector('canvas')!, state = _roots.get(canvas)!.store.getState()
  const object = state.scene.getObjectByName(name)
  if (!object) throw new Error(`Missing Farkle prop: ${name}`)
  const point = object.localToWorld(new Vector3(...offset)).project(state.camera), box = canvas.getBoundingClientRect()
  return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 }
}
