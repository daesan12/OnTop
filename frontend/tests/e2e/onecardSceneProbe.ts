import { _roots } from '@react-three/fiber'
import { avatars, useSession } from '../../src/network/worldClient'
import { Matrix4, Raycaster, Vector2, Vector3, type InstancedMesh, type Object3D, type PerspectiveCamera } from 'three'

export function oneCardOpeningProbe() {
  const scene = _roots.get(document.querySelector('canvas')!)!.store.getState().scene
  const opening = scene.getObjectByName('onecard-opening')
  const pieces: { visible: boolean; positions: number[][] }[] = []
  scene.traverse(object => {
    if (!object.name.startsWith('park-debris-pieces-')) return
    const mesh = object as InstancedMesh, matrix = new Matrix4()
    pieces.push({ visible: mesh.parent!.visible, positions: Array.from({ length: mesh.count }, (_, i) => {
      mesh.getMatrixAt(i, matrix)
      return new Vector3().setFromMatrixPosition(matrix).toArray()
    }) })
  })
  return { visible: opening?.visible, phase: opening?.userData.phase,
    flying: opening?.children.slice(6).filter(card => card.visible).length ?? 0, pieces }
}

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

/** Hit-test actual avatar-held instances, excluding cards hidden behind a head/body or another card. */
export function oneCardHeldCardTarget(userId: string, index: number) {
  const canvas = document.querySelector('canvas')!, state = _roots.get(canvas)!.store.getState()
  const mesh = state.scene.getObjectByName('onecard-held-cards-' + userId) as InstancedMesh | undefined
  if (!mesh || index >= mesh.count) return null
  state.scene.updateMatrixWorld(true); state.camera.updateMatrixWorld(true)
  const matrix = new Matrix4(), point = new Vector3(), ray = new Raycaster(), uv = new Vector2()
  mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld)
  const subjects = [...avatars.keys()].map(id => state.scene.getObjectByName('avatar-' + id)).filter((obj): obj is Object3D => !!obj && obj.visible)
  const rect = canvas.getBoundingClientRect()
  const candidates: { x: number; y: number }[] = []
  for (const y of [.08, .04, 0, -.04, -.08]) for (let column = 0; column <= 32; column++) {
    point.set(-.079 + column / 32 * .158, y, 0).applyMatrix4(matrix).project(state.camera)
    if (Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1 || Math.abs(point.z) >= 1) continue
    uv.set(point.x, point.y); ray.setFromCamera(uv, state.camera)
    const ownHit = ray.intersectObject(mesh)[0]
    if (ownHit?.instanceId !== index) continue
    candidates.push({ x: point.x, y: point.y })
  }
  for (let sample = 0; sample < Math.min(12, candidates.length); sample++) {
    const position = candidates[Math.floor((sample + .5) / Math.min(12, candidates.length) * candidates.length)]!
    uv.set(position.x, position.y); ray.setFromCamera(uv, state.camera)
    const hit = ray.intersectObjects(subjects, true).find(hit => {
      for (let node: Object3D | null = hit.object; node; node = node.parent) if (!node.visible) return false
      return !hit.object.name.startsWith('onecard-held-outline-')
    })
    const x = rect.left + (position.x + 1) * rect.width / 2, screenY = rect.top + (1 - position.y) * rect.height / 2
    if (hit?.object === mesh && hit.instanceId === index && document.elementFromPoint(x, screenY) === canvas)
      return { x, y: screenY, index, highlighted: mesh.userData.highlightedIndex as number }
  }
  return null
}

export function oneCardPickingDiagnostic(userId: string) {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  return state.scene.getObjectByName('onecard-held-cards-' + userId)?.userData
}

export async function settleOneCardCamera() {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState(), old = state.camera.position.clone()
  let stable = 0
  for (let frame = 0; frame < 180 && stable < 4; frame++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    stable = old.distanceToSquared(state.camera.position) < 1e-9 ? stable + 1 : 0; old.copy(state.camera.position)
  }
}
