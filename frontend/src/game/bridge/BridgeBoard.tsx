import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, Color, CylinderGeometry, LatheGeometry, MeshStandardMaterial, Object3D, Sphere, Vector2, Vector3, type InstancedMesh } from 'three'
import type { TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { recoveryBlocked, useGame } from '../store'
import { COLORS, goalZ, plankX, plankY, type Pose } from './presentation'
import { createMotions, presentedPawns, sampleMotion, shouldAnimate, type Cursor, type Motion, type PresentedPawn } from './motion'
import type { Bridge } from './protocol'

// Native shared meshes fit the current park; no model downloads, private dice or rules in this renderer.
const box = new BoxGeometry(1, 1, 1), marker = new CylinderGeometry(.065, .065, .005, 12)
const pawn = new LatheGeometry([[0, 0], [.035, 0], [.035, .015], [.022, .03], [.018, .065], [.027, .078], [.025, .098], [0, .108]].map(p => new Vector2(p[0], p[1])), 12)
const wood = new MeshStandardMaterial({ color: '#684b32', roughness: .85 }), water = new MeshStandardMaterial({ color: '#386d79', roughness: .55 })
const board = new MeshStandardMaterial({ color: '#b59b69', roughness: .85 }), white = new MeshStandardMaterial({ color: '#ffffff', roughness: .7 })
const cross = new MeshStandardMaterial({ color: '#253c34', roughness: 1 })
const noRaycast = () => {}
export function BridgeBoard({ anchor }: { anchor: TableAnchor }) {
  const state = useGame(useShallow(s => ({ b: s.game?.bridge, role: s.game?.role, gameId: s.game?.gameId, version: s.game?.version, recovering: recoveryBlocked(s) })))
  const session = useSession(useShallow(s => ({ status: s.status, tableId: s.tableId, watchedTableId: s.watchedTableId, roomId: s.roomId, bindings: s.bindings })))
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  if (!state.b || !binding || (state.role === 'PLAYER' ? session.tableId : session.watchedTableId) !== binding.tableId) return null
  return <BridgeScene key={`${state.gameId}/${anchor.id}`} b={state.b} gameId={state.gameId!} version={state.version!} connected={session.status === 'connected' && !state.recovering} />
}
function BridgeScene({ b, gameId, version, connected }: { b: Bridge; gameId: string; version: number; connected: boolean }) {
  const planks = useRef<InstancedMesh>(null), goals = useRef<InstancedMesh>(null), pawns = useRef<InstancedMesh>(null), crosses = useRef<InstancedMesh>(null)
  const previous = useRef<{ cursor: Cursor; pawns: PresentedPawn[] } | null>(null)
  const targets = useRef<PresentedPawn[]>([]), animation = useRef<{ start: number; resolutionTurnId: number; tracks: Map<number, Motion> } | null>(null)
  const scratch = useMemo(() => ({ transform: new Object3D(), color: new Color(), pose: { x: 0, y: 0, z: 0, scale: 0, roll: 0 } as Pose }), [])
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const draw = (elapsed: number) => {
    if (!pawns.current) return
    targets.current.forEach((p, index) => {
      const track = animation.current?.tracks.get(p.id)
      if (track) sampleMotion(track, elapsed, scratch.pose); else Object.assign(scratch.pose, p.pose)
      const v = scratch.pose, transform = scratch.transform
      transform.position.set(v.x, v.y, v.z); transform.scale.setScalar(v.scale); transform.rotation.set(0, 0, v.roll); transform.updateMatrix()
      pawns.current!.setMatrixAt(index, transform.matrix)
    })
    pawns.current.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => {
    const instances = [planks.current!, goals.current!, pawns.current!, crosses.current!]
    return () => instances.forEach(mesh => mesh.dispose())
  }, [])
  useEffect(() => { if (!connected) { previous.current = null; animation.current = null; draw(0) } }, [connected])
  useFrame(() => {
    if (!animation.current) return
    const elapsed = Date.now() - animation.current.start
    if (elapsed >= 1500 || document.hidden) animation.current = null
    draw(elapsed)
  })
  useLayoutEffect(() => {
    const next = presentedPawns(b), cursor: Cursor = { gameId, version, resolutionTurnId: b.resolution?.turnId ?? -1 }, now = Date.now()
    if (!connected) previous.current = null
    if (connected && !reducedMotion && !document.hidden && shouldAnimate(previous.current?.cursor ?? null, cursor, b.resolution, now))
      animation.current = { start: Date.parse(b.resolution!.startedAt), resolutionTurnId: b.resolution!.turnId, tracks: createMotions(previous.current!.pawns, next, b.resolution!) }
    else if (!previous.current || !connected || b.operations.length && b.resolution?.turnId !== b.turnId || animation.current?.resolutionTurnId !== b.resolution?.turnId) animation.current = null
    targets.current = next; previous.current = connected ? { cursor, pawns: next } : null
    const t = scratch.transform, color = scratch.color
    let crossCount = 0
    for (let i = 0; i < 8; i++) {
      t.rotation.set(0, 0, 0); t.position.set(plankX(i + 1), plankY(i + 1) - .011, 0); t.scale.set(.12, .022, .46); t.updateMatrix(); planks.current!.setMatrixAt(i, t.matrix)
      t.position.set(.82, .07, goalZ(i + 1)); t.scale.setScalar(1); t.updateMatrix(); goals.current!.setMatrixAt(i, t.matrix)
      const slot = b.goalSlots[i]!, owner = b.players.findIndex(p => p.userId === slot.userId)
      goals.current!.setColorAt(i, color.set(slot.status === 'VACATED' ? '#6f7770' : owner >= 0 ? COLORS[owner]! : '#d9ccaa'))
      if (slot.status === 'VACATED') for (const angle of [-Math.PI / 4, Math.PI / 4]) {
        t.position.set(.82, .078, goalZ(slot.slot)); t.rotation.set(0, angle, 0); t.scale.set(.1, .006, .012); t.updateMatrix(); crosses.current!.setMatrixAt(crossCount++, t.matrix)
      }
    }
    next.forEach((p, i) => pawns.current!.setColorAt(i, color.set(COLORS[p.playerIndex]!)))
    pawns.current!.count = next.length; pawns.current!.boundingSphere = new Sphere(new Vector3(0, 0, 0), 2)
    crosses.current!.count = crossCount
    draw(animation.current ? now - animation.current.start : 0)
    for (const mesh of [planks.current!, goals.current!, crosses.current!, pawns.current!]) {
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      if (mesh !== pawns.current) mesh.computeBoundingSphere()
    }
  }, [b, gameId, version, connected, reducedMotion, scratch])
  return <group name="bridge-table" position={[0, 1.11, 0]} dispose={null} userData={{ gameId }}>
    <mesh geometry={box} material={wood} scale={[2.02, .025, 1.35]} raycast={noRaycast} />
    <mesh geometry={box} material={water} position={[0, .017, 0]} scale={[1.4, .01, .58]} raycast={noRaycast} />
    {[-.81, .81].map(x => <mesh key={x} geometry={box} material={board} position={[x, .03, 0]} scale={[.25, .04, 1.2]} raycast={noRaycast} />)}
    <instancedMesh name="bridge-planks" ref={planks} args={[box, board, 8]} dispose={null} raycast={noRaycast} />
    <instancedMesh name="bridge-goals" ref={goals} args={[marker, white, 8]} dispose={null} raycast={noRaycast} />
    <instancedMesh name="bridge-pawns" ref={pawns} args={[pawn, white, 28]} dispose={null} raycast={noRaycast} />
    <instancedMesh name="bridge-vacated" ref={crosses} args={[box, cross, 16]} dispose={null} raycast={noRaycast} />
  </group>
}
