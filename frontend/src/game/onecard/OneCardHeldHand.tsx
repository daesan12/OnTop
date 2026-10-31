import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { DoubleSide, EdgesGeometry, LineBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3,
  type Group, type InstancedMesh, type LineSegments } from 'three'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { useGame } from '../store'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { dealtCount } from './opening'
import { useReducedMotion } from './useReducedMotion'
import { scenePointerOwners } from '../../world/inputOwnership'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { createBackTexture } from './artwork'
import { heldCardPose, oneCardHeldCount } from './heldHand'
import { chooseHeldCard, previewHeldCard, spectatorCardAvailable, useHeldCardPicking, type HeldCardTarget } from './spectatorTargets'

const cardPlane = new PlaneGeometry(.17, .23), cardEdges = new EdgesGeometry(cardPlane)
const edgeMaterial = new LineBasicMaterial({ color: '#f5d589', depthTest: true })
let sharedBack: MeshStandardMaterial | undefined
const backMaterial = () => sharedBack ??= new MeshStandardMaterial({ map: createBackTexture(), roughness: .8, side: DoubleSide })
function visible(object: Object3D) { for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false; return true }

/** Both sides remain generic backs. Picking uses the actual instance hit, including avatar occlusion. */
export function OneCardHeldHand({ userId, model }: { userId: string; model: ReturnType<typeof createCharacterRig> }) {
  const reduced = useReducedMotion()
  const root = useRef<Group>(null), mesh = useRef<InstancedMesh>(null), outline = useRef<LineSegments>(null)
  const points = useMemo(() => ({ left: new Vector3(), right: new Vector3() }), [])
  const transform = useMemo(() => new Object3D(), []), layout = useRef({ count: -1, mark: -1 })
  const pressed = useRef<HeldCardTarget | null>(null), runtime = useParkRuntime(), canvas = useThree(s => s.gl.domElement)
  const count = useGame(s => { const player = s.game?.onecard?.players.find(p => p.userId === userId)
    return s.game?.onecard?.status === 'PLAYING' && player?.active ? player.cardCount : 0 })
  const hasCards = count > 0
  useLayoutEffect(() => { const instance = mesh.current; return () => instance?.dispose() }, [hasCards])
  useEffect(() => () => {
    for (const [pointer, owner] of scenePointerOwners) if (owner === `onecard/${userId}`) scenePointerOwners.delete(pointer)
    if (useHeldCardPicking.getState().hover?.userId === userId) { previewHeldCard(null); canvas.style.cursor = '' }
  }, [canvas, userId])
  useFrame(() => {
    const avatar = avatars.get(userId), game = useGame.getState().game
    if (!root.current || !mesh.current) return
    root.current.visible = !!avatar && avatar.seatIndex >= 0 && oneCardHeldCount(userId, avatar.tableId) > 0
    if (!root.current.visible || !root.current.parent) return
    const displayed = !reduced && game?.onecard ? dealtCount(game.onecard, game.version, userId, estimatedServerTime()) : count
    model.bones.hand_L.getWorldPosition(points.left); model.bones.hand_R.getWorldPosition(points.right)
    points.left.add(points.right).multiplyScalar(.5); root.current.parent.worldToLocal(points.left)
    root.current.position.copy(points.left); root.current.position.y += .15; root.current.position.z += .025
    const picking = useHeldCardPicking.getState(), candidate = picking.hover ?? picking.selected
    const mark = game?.role === 'SPECTATOR' && candidate?.version === game.version && candidate.userId === userId
      && candidate.index < count ? candidate.index : -1
    if (layout.current.count !== displayed || layout.current.mark !== mark) {
      for (let index = 0; index < count; index++) {
        const card = heldCardPose(index, count)
        transform.position.set(card.x, card.y, card.z)
        transform.rotation.set(0, 0, card.angle); transform.updateMatrix(); mesh.current.setMatrixAt(index, transform.matrix)
        if (index === mark && outline.current) outline.current.matrix.copy(transform.matrix)
      }
      mesh.current.count = displayed; mesh.current.instanceMatrix.needsUpdate = true
      mesh.current.computeBoundingSphere(); mesh.current.computeBoundingBox(); layout.current = { count: displayed, mark }
    }
    if (outline.current) outline.current.visible = mark >= 0
    mesh.current.userData.highlightedIndex = mark
  })
  const target = (event: ThreeEvent<PointerEvent | MouseEvent>): HeldCardTarget | null => {
    const game = useGame.getState().game, first = event.intersections.find(hit => visible(hit.object))
    if (!root.current?.visible || first?.object !== mesh.current || event.instanceId === undefined
      || first.instanceId !== event.instanceId || game?.role !== 'SPECTATOR') return null
    const value = { userId, index: event.instanceId, version: game.version }
    return spectatorCardAvailable(value) ? value : null
  }
  const hover = (event: ThreeEvent<PointerEvent>) => {
    const value = target(event)
    if (!value) {
      if (useHeldCardPicking.getState().hover?.userId === userId) { previewHeldCard(null); canvas.style.cursor = '' }
      return
    }
    event.stopPropagation(); previewHeldCard(value); canvas.style.cursor = 'pointer'
  }
  if (!count) return null
  return <group ref={root} name={`onecard-held-hand-${userId}`} rotation={[.8, 0, 0]}
    userData={{ cardCount: count, displayedCount: count }} dispose={null}>
    <instancedMesh ref={mesh} name={`onecard-held-cards-${userId}`} args={[cardPlane, backMaterial(), 54]} dispose={null}
      onPointerOver={hover} onPointerMove={hover} onPointerOut={() => {
        if (useHeldCardPicking.getState().hover?.userId === userId) { previewHeldCard(null); canvas.style.cursor = '' }
      }} onPointerDown={event => {
        if (event.button !== 0) return
        pressed.current = target(event)
        if (pressed.current) { event.stopPropagation(); scenePointerOwners.set(event.pointerId, `onecard/${userId}`) }
      }}
      onPointerUp={event => scenePointerOwners.delete(event.pointerId)}
      onPointerCancel={event => { scenePointerOwners.delete(event.pointerId); pressed.current = null; previewHeldCard(null); canvas.style.cursor = '' }}
      onClick={event => {
        const value = target(event), down = pressed.current
        if (!value) return
        pressed.current = null
        if (!down || value.version !== down.version || event.delta > 6) return
        event.stopPropagation(); chooseHeldCard(runtime, down)
      }} />
    <lineSegments ref={outline} name={`onecard-held-outline-${userId}`} geometry={cardEdges} material={edgeMaterial}
      matrixAutoUpdate={false} visible={false} raycast={() => {}} />
  </group>
}
