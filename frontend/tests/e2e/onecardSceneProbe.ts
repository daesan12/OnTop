import { _roots } from '@react-three/fiber'
import { avatars, useSession } from '../../src/network/worldClient'
import { Vector3, type InstancedMesh, type PerspectiveCamera } from 'three'

export function oneCardSceneProbe() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  return { ownVisible: state.scene.getObjectByName('avatar-' + useSession.getState().sessionId)?.visible,
    fov: (state.camera as PerspectiveCamera).fov, position: state.camera.position.toArray(),
    topCard: !!state.scene.getObjectByName('onecard-public-top'),
    players: ['101', '102', '103', '104'].map(id => ({ id, seat: avatars.get(id)?.seatIndex,
      table: avatars.get(id)?.tableId, visible: state.scene.getObjectByName('avatar-' + id)?.visible,
      heldCount: state.scene.getObjectByName('onecard-held-hand-' + id)?.userData.cardCount ?? 0,
      displayedCount: (state.scene.getObjectByName('onecard-held-cards-' + id) as InstancedMesh | undefined)?.count ?? 0 })) }
}

/** Project the real mesh so browser tests exercise the deck's actual pointer hit area. */
export function oneCardDeckTarget() {
  const canvas = document.querySelector('canvas')!, state = _roots.get(canvas)!.store.getState()
  const deck = state.scene.getObjectByName('onecard-deck-hit')!, point = deck.getWorldPosition(new Vector3()).project(state.camera)
  const rect = canvas.getBoundingClientRect(), x = rect.left + (point.x + 1) * rect.width / 2, y = rect.top + (1 - point.y) * rect.height / 2
  return { x, y, exposed: document.elementFromPoint(x, y) === canvas,
    allowed: !!state.scene.getObjectByName('onecard-draw-deck')?.userData.canDraw,
    flight: !!state.scene.getObjectByName('onecard-draw-flight')?.visible,
    publicCard: state.scene.getObjectByName('onecard-public-top')?.userData.cardId }
}
