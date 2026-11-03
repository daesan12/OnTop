import { _roots } from '@react-three/fiber'
import type { Object3D } from 'three'

const counts = { calls: 0, hidden: 0, own: 0 }
export function watchAvatarPicking(ownId: string) {
  counts.calls = counts.hidden = counts.own = 0
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  state.scene.getObjectByName('visitors')!.traverse(object => {
    if (!('isSkinnedMesh' in object) || object.userData.pickingWatched) return
    object.userData.pickingWatched = true
    const original = object.raycast
    object.raycast = function (...args) {
      counts.calls++
      let visible = true, own = false
      for (let parent: Object3D | null = this; parent; parent = parent.parent) {
        visible &&= parent.visible
        own ||= parent.name === 'avatar-' + ownId
      }
      if (!visible) counts.hidden++
      if (own) counts.own++
      return original.apply(this, args)
    }
  })
  return { ...counts }
}
export const avatarPickingCounts = () => ({ ...counts })
