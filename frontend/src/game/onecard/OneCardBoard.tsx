import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { useFrame, useThree } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, ExtrudeGeometry, MeshBasicMaterial, MeshStandardMaterial, Path, PlaneGeometry, Shape, ShapeGeometry, type Group } from 'three'
import { tableScale, tableSeats, type TableAnchor } from '../../config'
import { avatars, useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { recoveryBlocked, useGame } from '../store'
import type { Card, OneCard, OneCardInput } from './protocol'
import { canActOneCard } from './actions'
import { createBackTexture, createFaceTexture, createFeltTexture } from './artwork'
import { stepSpring } from './motion'
import { useReducedMotion } from './useReducedMotion'
import { OneCardOpening } from './OneCardOpening'

// Only approved public cards and common backs enter the shared scene.
const face = new PlaneGeometry(.3, .43), slab = new BoxGeometry(1, 1, 1), hit = new BoxGeometry(.44, .09, .61)
const paper = new MeshStandardMaterial({ color: '#eee5d4', roughness: 1 })
const edge = new MeshStandardMaterial({ color: '#3b3024', metalness: .05, roughness: .8 })
const brass = new MeshStandardMaterial({ color: '#bda571', metalness: .3, roughness: .7 })
const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
function rounded<T extends Shape | Path>(path: T, w: number, h: number, r: number): T {
  const x = -w / 2, y = -h / 2
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r)
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r)
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); path.closePath()
  return path
}
const matBase = new ExtrudeGeometry(rounded(new Shape(), 1.85, 1.34, .095), {
  depth: .018, bevelEnabled: true, bevelThickness: .004, bevelSize: .005, bevelSegments: 1, curveSegments: 5,
}).rotateX(-Math.PI / 2)
const rim = rounded(new Shape(), 1.825, 1.315, .085)
rim.holes.push(rounded(new Path(), 1.8, 1.29, .075))
const rimGeometry = new ShapeGeometry(rim, 5), feltPlane = new ShapeGeometry(rounded(new Shape(), 1.79, 1.28, .07), 5)
const feltPositions = feltPlane.getAttribute('position'), feltUVs = feltPlane.getAttribute('uv')
for (let i = 0; i < feltPositions.count; i++) feltUVs.setXY(i, feltPositions.getX(i) / 1.79 + .5, feltPositions.getY(i) / 1.28 + .5)
let sharedArtwork: { felt: MeshStandardMaterial; back: MeshStandardMaterial } | undefined
function tableArtwork() {
  return sharedArtwork ??= {
    felt: new MeshStandardMaterial({ map: createFeltTexture(), roughness: 1 }),
    back: new MeshStandardMaterial({ map: createBackTexture(), roughness: .9 }),
  }
}
export function CardBody({ back = false }: { back?: boolean }) {
  return <><mesh geometry={slab} material={paper} scale={[.3, .006, .43]} />
    {back && <mesh geometry={face} material={tableArtwork().back} position={[0, .004, 0]} rotation={[-Math.PI / 2, 0, 0]} />}</>
}
function seatPosition(anchor: TableAnchor, userId: string) {
  const seat = tableSeats(anchor)[avatars.get(userId)?.seatIndex ?? 0] ?? tableSeats(anchor)[0]!
  const scale = tableScale(anchor)
  return { x: seat.x / scale * .65, z: seat.z / scale * .65 }
}
function PublicCard({ card, surfaceY, turnUserId, anchor }: { card: Card; surfaceY: number; turnUserId: string | null; anchor: TableAnchor }) {
  const root = useRef<Group>(null), previous = useRef({ cardId: card.id, userId: turnUserId })
  const flight = useRef({ elapsed: 1, x: .23, z: 0 }), impact = useRef({ position: 0, velocity: 0 })
  const reduced = useReducedMotion()
  const texture = useMemo(() => createFaceTexture(card), [card.id, card.rank, card.suit])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture, roughness: 1 }), [texture])
  useEffect(() => () => { material.dispose(); texture.dispose() }, [texture, material])
  useLayoutEffect(() => {
    if (previous.current.cardId !== card.id) {
      flight.current = { elapsed: reduced || document.hidden ? 1 : 0, ...seatPosition(anchor, previous.current.userId ?? '') }
      impact.current = reduced ? { position: 0, velocity: 0 } : { position: .014, velocity: -.12 }
    }
    previous.current = { cardId: card.id, userId: turnUserId }
  }, [card.id, turnUserId, anchor, reduced])
  useFrame((_, delta) => {
    if (!root.current) return
    const motion = flight.current
    motion.elapsed = reduced || document.hidden ? 1 : Math.min(1, motion.elapsed + Math.min(delta, .064) / .55)
    const t = Math.min(1, motion.elapsed / .72), ease = 1 - (1 - t) ** 3
    const settle = !reduced && t >= 1 ? stepSpring(impact.current, 0, delta) : 0
    root.current.position.set(motion.x + (.23 - motion.x) * ease, surfaceY + Math.sin(t * Math.PI) * .17 + Math.abs(settle), motion.z * (1 - ease))
    root.current.rotation.set((1 - ease) * .18, (1 - ease) * -.35 + settle * 2, (1 - ease) * -.12)
    root.current.userData.moving = motion.elapsed < 1
  })
  return <group ref={root} name="onecard-public-top" position={[.23, surfaceY, 0]} scale={[.9, 1, .9]} userData={{ cardId: card.id }} dispose={null}>
    <CardBody /><mesh geometry={face} material={material} position={[0, .004, 0]} rotation={[-Math.PI / 2, 0, 0]} />
  </group>
}
function CardDeck({ gameId, drawCount, surfaceY, tableId }: { gameId?: string; drawCount: number; surfaceY: number; tableId: string }) {
  const root = useRef<Group>(null), hovering = useRef(false), lift = useRef({ position: 0, velocity: 0 })
  const runtime = useParkRuntime(), { gl } = useThree(), reduced = useReducedMotion()
  const height = Math.max(.008, drawCount * .0012)
  const input = (): OneCardInput | null => {
    const session = useSession.getState(), current = useGame.getState().game
    if (!gameId || current?.gameId !== gameId || session.tableId !== tableId || session.status !== 'connected' || session.pending) return null
    const action = { kind: current.onecard?.attackTotal ? 'accept-attack' : 'draw' } as const
    return canActOneCard(session.sessionId, action) ? action : null
  }
  useEffect(() => () => { if (hovering.current && gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = '' }, [gl])
  useFrame((_, delta) => {
    if (!root.current) return
    const allowed = !!input(), target = hovering.current && allowed ? .024 : 0
    root.current.position.y = reduced ? 0 : stepSpring(lift.current, target, delta)
    root.current.userData.canDraw = allowed
    if (hovering.current) gl.domElement.style.cursor = allowed ? 'pointer' : ''
  })
  return <group ref={root} name={gameId ? 'onecard-draw-deck' : 'onecard-preparation-prop'} position={[-.28, 0, 0]} scale={[.9, 1, .9]} dispose={null}
    onPointerOver={event => { event.stopPropagation(); hovering.current = true; if (input()) gl.domElement.style.cursor = 'pointer' }}
    onPointerOut={() => { hovering.current = false; if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = '' }}
    onClick={event => {
      event.stopPropagation()
      if (event.button !== 0) return
      const action = input()
      if (action) void runtime.actOneCard(action)
    }}>
    {drawCount > 0 && <><mesh geometry={slab} material={paper} position={[0, surfaceY + height / 2, 0]} scale={[.3, height, .43]} />
      <mesh geometry={face} material={tableArtwork().back} position={[0, surfaceY + height + .004, 0]} rotation={[-Math.PI / 2, 0, 0]} /></>}
    {/* Keep an empty deck clickable; reshuffling and draw permission belong to BE. */}
    <mesh name="onecard-deck-hit" geometry={hit} material={hitMaterial} position={[0, surfaceY + height, 0]} />
  </group>
}
/** Public hand-count increases produce face-down flights; no private card is inferred. */
function DrawnCards({ state, anchor, surfaceY, connected }: { state: OneCard; anchor: TableAnchor; surfaceY: number; connected: boolean }) {
  const root = useRef<Group>(null), previous = useRef<OneCard | null>(null), reduced = useReducedMotion()
  const flight = useRef({ elapsed: 1, count: 0, x: 0, z: 0 })
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = connected ? state : null
    if (!connected || reduced) { flight.current.elapsed = 1; return }
    const target = before && state.players.find(p => p.cardCount > (before.players.find(old => old.userId === p.userId)?.cardCount ?? p.cardCount))
    if (!target) return
    const count = target.cardCount - before!.players.find(p => p.userId === target.userId)!.cardCount
    flight.current = { elapsed: document.hidden ? 1 : 0, count: Math.min(3, count), ...seatPosition(anchor, target.userId) }
  }, [state, anchor, connected, reduced])
  useFrame((_, delta) => {
    if (!root.current) return
    const motion = flight.current
    motion.elapsed = document.hidden || reduced ? 1 : Math.min(1, motion.elapsed + Math.min(delta, .064) / .62)
    root.current.visible = connected && motion.elapsed < 1
    root.current.userData.count = motion.count
    for (let i = 0; i < root.current.children.length; i++) {
      const child = root.current.children[i]!, t = Math.max(0, Math.min(1, (motion.elapsed - i * .09) / .8)), ease = 1 - (1 - t) ** 2
      child.visible = i < motion.count && t < 1
      child.position.set(-.28 + (motion.x + .28) * ease, surfaceY + .045 + Math.sin(t * Math.PI) * .24, motion.z * ease)
      child.rotation.set(Math.sin(t * Math.PI) * -.35, t * .15, (1 - t) * .08)
    }
  })
  return <group ref={root} name="onecard-draw-flight" visible={false} dispose={null}>
    {[0, 1, 2].map(i => <group key={i} scale={[.9, 1, .9]}><CardBody back /></group>)}
  </group>
}
export function OneCardBoard({ anchor }: { anchor: TableAnchor }) {
  const state = useGame(useShallow(s => ({ onecard: s.game?.onecard, role: s.game?.role, gameId: s.game?.gameId, recovering: recoveryBlocked(s) })))
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId, tableStates: s.tableStates, status: s.status })))
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = state.onecard && !!binding && (state.role === 'PLAYER' ? session.tableId : session.watchedTableId) === binding.tableId
  const selected = useTableGameCode(anchor.id) === 'ONE_CARD'
  if (!relevant && !selected) return null
  const o = relevant ? state.onecard! : null, main = anchor.pavilionId === 'P0', surfaceY = main ? 1.078 : 1.094
  return <group name="onecard-table" dispose={null}>
    <group name="onecard-felt-mat">
      {!main && <><mesh geometry={matBase} material={edge} position={[0, 1.063, 0]} />
        <mesh geometry={rimGeometry} material={brass} position={[0, 1.087, 0]} rotation={[-Math.PI / 2, 0, 0]} /></>}
      <mesh geometry={feltPlane} material={tableArtwork().felt} position={[0, main ? 1.07 : 1.088, 0]}
        scale={main ? [.91, .89, 1] : 1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
    <CardDeck key={`${state.gameId ?? 'preparing'}/${binding?.tableId}`} gameId={o ? state.gameId : undefined} drawCount={o?.drawCount ?? 1} surfaceY={surfaceY} tableId={binding!.tableId} />
    {o && <group key={state.gameId}>
      <PublicCard card={o.topCard} surfaceY={surfaceY} turnUserId={o.turnUserId} anchor={anchor} />
      <DrawnCards state={o} anchor={anchor} surfaceY={surfaceY} connected={session.status === 'connected' && !state.recovering} />
      <OneCardOpening anchor={anchor} surfaceY={surfaceY} />
    </group>}
  </group>
}
