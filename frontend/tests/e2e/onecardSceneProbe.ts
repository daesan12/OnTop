import { _roots } from '@react-three/fiber'
import { useSession } from '../../src/network/worldClient'
import type { PerspectiveCamera } from 'three'

export function oneCardSceneProbe() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  return { ownVisible: state.scene.getObjectByName('avatar-' + useSession.getState().sessionId)?.visible,
    fov: (state.camera as PerspectiveCamera).fov, position: state.camera.position.toArray(),
    topCard: !!state.scene.getObjectByName('onecard-public-top') }
}
