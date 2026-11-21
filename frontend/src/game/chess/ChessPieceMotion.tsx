import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { ChessPiece3D } from './ChessPiece3D'
import { createChessMaterials } from './materials'
import { chessCapturePose, chessMotion, chessPoint, chessTravelPose, type ChessMotion, type ChessPosition, type PieceTravel } from './motion'

const motionQuery = '(prefers-reduced-motion: reduce)'
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia(motionQuery).matches
const subscribeMotion = (notify: () => void) => {
  const query = matchMedia(motionQuery); query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
export type ActiveChessMotion = ChessMotion & { startedAt: number }
type PieceProps = Parameters<typeof ChessPiece3D>[0]
type Materials = ReturnType<typeof createChessMaterials>

export function useChessPieceMotion(board: string, gameId: string, moves: readonly string[], enabled: boolean) {
  const previous = useRef<ChessPosition | null>(null), [motion, setMotion] = useState<ActiveChessMotion | null>(null)
  const reduceMotion = useSyncExternalStore(subscribeMotion, reduced, () => false)
  const history = moves.join(' ')
  useLayoutEffect(() => {
    const next = { board, gameId, moves: history ? history.split(' ') : [] }, before = previous.current
    previous.current = next
    const plan = enabled && !reduceMotion ? chessMotion(before, next) : null
    setMotion(plan ? { ...plan, startedAt: performance.now() } : null)
  }, [board, gameId, history, enabled, reduceMotion])
  useFrame(state => {
    if (!motion) return
    if (performance.now() - motion.startedAt >= motion.duration * 1000) setMotion(null)
    else state.invalidate()
  })
  return motion
}

export function MovingChessPiece({ travel, motion, ...pieceProps }: PieceProps & { travel: PieceTravel; motion: ActiveChessMotion }) {
  const root = useRef<Group>(null)
  const update = (t: number) => { if (root.current) { const p = chessTravelPose(travel, t); root.current.position.set(p.x, .026 + p.y, p.z) } }
  useLayoutEffect(() => update(0), [motion])
  useFrame(() => update((performance.now() - motion.startedAt) / (motion.duration * 1000)))
  return <group ref={root} name={`chess-moving-${travel.from}-${travel.to}`}><ChessPiece3D {...pieceProps} piece={travel.piece} /></group>
}

export function CapturedChessPiece({ motion, geometry, materials, layer }: {
  motion: ActiveChessMotion; geometry: PieceProps['geometry']; materials: Materials; layer: number
}) {
  const root = useRef<Group>(null), capture = motion.captured!, white = capture.piece === capture.piece.toUpperCase(), at = chessPoint(capture.index)
  const faded = useMemo(() => ({ body: (white ? materials.white : materials.black).clone(), detail: materials.gold.clone(),
    eye: materials.eye.clone(), mane: (white ? materials.whiteMane : materials.blackMane).clone() }), [materials, white])
  useLayoutEffect(() => {
    for (const material of Object.values(faded)) { material.transparent = true; material.depthWrite = false }
    root.current?.traverse(object => { object.layers.set(0); if (layer) object.layers.enable(layer); object.raycast = () => {}; object.castShadow = false })
  }, [faded, layer])
  useEffect(() => () => Object.values(faded).forEach(material => material.dispose()), [faded])
  useFrame(() => {
    const p = chessCapturePose((performance.now() - motion.startedAt) / (motion.duration * 1000))
    if (root.current) { root.current.position.y = .051 + p.y; root.current.scale.setScalar(p.scale); root.current.rotation.z = p.tilt * (white ? 1 : -1) }
    for (const material of Object.values(faded)) material.opacity = p.opacity
  })
  return <group ref={root} name={`chess-captured-${capture.index}`} position={[at.x, .051, at.z]}>
    <ChessPiece3D piece={capture.piece} geometry={geometry} material={faded.body} detail={faded.detail} eye={faded.eye} mane={faded.mane} />
  </group>
}
