import { _roots } from '@react-three/fiber'
import { avatars, useSession } from '../../src/network/worldClient'
import type { PerspectiveCamera } from 'three'

export function oneCardSceneProbe() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  return { ownVisible: state.scene.getObjectByName('avatar-' + useSession.getState().sessionId)?.visible,
    fov: (state.camera as PerspectiveCamera).fov, position: state.camera.position.toArray(),
    topCard: !!state.scene.getObjectByName('onecard-public-top'),
    players: ['101', '102', '103', '104'].map(id => ({ id, seat: avatars.get(id)?.seatIndex,
      table: avatars.get(id)?.tableId, visible: state.scene.getObjectByName('avatar-' + id)?.visible,
      heldCount: state.scene.getObjectByName('onecard-held-hand-' + id)?.userData.cardCount ?? 0 })) }
}
