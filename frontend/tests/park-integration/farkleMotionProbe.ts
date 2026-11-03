import { _roots } from '@react-three/fiber'

/** Read-only inspection of presentation meshes, separate from confirmed result faces. */
export function farkleMotionProbe() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  const rolling: { name: string; visible: boolean; rotation: number[] }[] = []
  state.scene.traverse(object => {
    if (object.name.startsWith('farkle-rolling-die-')) rolling.push({ name: object.name, visible: object.visible, rotation: object.quaternion.toArray() })
  })
  return { rolling }
}
