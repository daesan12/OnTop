import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, CircleGeometry, Euler, LatheGeometry, Matrix4, MeshStandardMaterial, Quaternion, Vector2, Vector3,
  type Group, type InstancedMesh } from 'three'
import type { TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import type { DiceGame, Farkle } from '../protocol'
import { cupMotion, useDiceUI, diceCamera, canRollDice, diceCanAct, diceScope, cancelCup, rollDice, selectedDice, toggleDie } from './controls'
import { CupDrag } from './cupDrag'
import { ShakeTracker } from './shake'

// App-lifetime shared geometry/materials. Six bodies plus six instanced pip draws, no texture downloads.
const body = new BoxGeometry(.18, .18, .18), pip = new CircleGeometry(.012, 8)
const bone = new MeshStandardMaterial({ color: '#eee8d2', roughness: .42 }), ink = new MeshStandardMaterial({ color: '#282722' })
const felt = new MeshStandardMaterial({ color: '#2b554c', roughness: 1 }), wood = new MeshStandardMaterial({ color: '#593d29', roughness: .7 })
const tray = new BoxGeometry(1.5, .025, 1.15)
const cupGeometry = new LatheGeometry([[0, 0], [.1, 0], [.13, .04], [.14, .27], [.125, .29], [.11, .27], [.095, .06], [0, .045]].map(p => new Vector2(...p as [number, number])), 16)
const normals = [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, -1, 0)]
const finalRotations = normals.map(n => new Quaternion().setFromUnitVectors(n, new Vector3(0, 1, 0)))
const pipMatrices: Matrix4[] = []
for (let face = 1; face <= 6; face++) {
  const points: [number, number][] = face === 1 ? [[0, 0]] : face === 2 ? [[-1, -1], [1, 1]] : face === 3 ? [[-1, -1], [0, 0], [1, 1]]
    : face === 4 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : face === 5 ? [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]
    : [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normals[face - 1]!)
  for (const [x, y] of points) {
    const point = new Vector3(x * .045, y * .045, 0).applyQuaternion(rotation).addScaledVector(normals[face - 1]!, .0905)
    pipMatrices.push(new Matrix4().compose(point, rotation, new Vector3(1, 1, 1)))
  }
}
const noRaycast = () => {}
function Die({ die, game }: { die: Farkle['dice'][number]; game: DiceGame }) {
  const root = useRef<Group>(null), dots = useRef<InstancedMesh>(null)
  const rotation = useRef(new Quaternion()), euler = useRef(new Euler())
  useLayoutEffect(() => {
    const instances = dots.current!
    pipMatrices.forEach((m, i) => instances.setMatrixAt(i, m)); instances.instanceMatrix.needsUpdate = true
    // Release per-die instance buffers while preserving shared app-lifetime geometry/materials.
    return () => instances.dispose()
  }, [])
  useFrame(() => {
    if (!root.current) return
    const ui = useDiceUI.getState(), p = die.held || !ui.animationAt ? 1 : Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / 900))
    const x = die.held ? -.64 : -.32 + die.id % 3 * .32, z = die.held ? -.4 + die.id * .15 : -.23 + Math.floor(die.id / 3) * .43
    const selected = selectedDice().includes(die.id)
    root.current.position.set(x, 1.22 + (selected ? .04 : 0) + Math.sin(p * Math.PI) * .25, z)
    rotation.current.setFromEuler(euler.current.set((1 - p) * (10 + die.id), (1 - p) * 7, (1 - p) * 5))
    root.current.quaternion.copy(rotation.current).multiply(finalRotations[die.value - 1]!)
  })
  return <group ref={root} name={`farkle-die-${die.id}`} userData={{ face: die.value, held: die.held }} onClick={e => {
    e.stopPropagation()
    const current = useGame.getState().game
    if (current?.gameId === game.gameId && current.version === game.version) toggleDie(die.id)
  }}>
    <mesh geometry={body} material={bone} dispose={null} />
    <instancedMesh ref={dots} args={[pip, ink, 21]} raycast={noRaycast} dispose={null} />
  </group>
}
export function FarkleTable({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId,
    watchedTableId: s.watchedTableId, tableStates: s.tableStates }))), g = useGame(s => s.game?.dice ? s.game : null)
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!binding && !!g && (session.tableId === binding.tableId || (g.role === 'SPECTATOR' && session.watchedTableId === binding.tableId))
  const selected = !!binding && session.tableStates[binding.tableId]?.gameCode === 'DICE'
  if (!relevant && !selected) return null
  return <FarkleSurface anchor={anchor} game={relevant ? g : null} />
}
function FarkleSurface({ anchor, game }: { anchor: TableAnchor; game: DiceGame | null }) {
  const root = useRef<Group>(null), cup = useRef<Group>(null), drag = useRef<{ scope: string; id: number; shake: ShakeTracker; projector: CupDrag } | null>(null)
  const { gl, camera } = useThree()
  const own = useSession(s => s.sessionId), sign = game?.dice.players.indexOf(own) === 1 ? -1 : 1
  const active = !!game && game.role === 'PLAYER'
  useEffect(() => {
    if (!active) return
    const cancel = () => {
      const current = drag.current; drag.current = null
      if (current) { try { gl.domElement.releasePointerCapture(current.id) } catch {} }
      gl.domElement.style.cursor = ''; cupMotion.lift = 0
    }
    cupMotion.cancel = cancel
    const move = (e: PointerEvent) => {
      const current = drag.current
      if (!current || e.pointerId !== current.id) return
      if (!diceCanAct() || current.scope !== diceScope()) { cancelCup(); return }
      const point = current.projector.move(e.clientX, e.clientY, gl.domElement.getBoundingClientRect())
      cupMotion.x = point.x; cupMotion.z = point.z
      if (current.shake.move(e.clientX, e.clientY) && useDiceUI.getState().cup !== 'ready') useDiceUI.setState({ cup: 'ready' })
    }
    const up = (e: PointerEvent) => {
      const current = drag.current
      if (!current || e.pointerId !== current.id) return
      const shouldRoll = current.scope === diceScope() && useDiceUI.getState().cup === 'ready' && canRollDice()
      cancelCup()
      if (shouldRoll) rollDice()
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelCup)
    return () => { cancel(); if (cupMotion.cancel === cancel) cupMotion.cancel = () => {}
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelCup) }
  }, [active, gl])
  useFrame(() => {
    if (!cup.current) return
    const ui = useDiceUI.getState()
    if (active && ui.cup !== 'idle' && !diceCanAct()) cancelCup()
    const held = active && ui.cup !== 'idle'
    const progress = game?.dice && ui.animationAt ? Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / 900)) : 1
    cup.current.position.set(held ? cupMotion.x : .91, held ? 1.36 : 1.08 + Math.sin(progress * Math.PI) * .22, held ? cupMotion.z : sign * .4)
    cup.current.rotation.z = held ? Math.sin(performance.now() / 80) * .08 : Math.sin(progress * Math.PI) * 1.3
  })
  return <group ref={root} name={`farkle-table-${anchor.id}`}>
    <mesh geometry={tray} material={felt} position={[0, 1.11, 0]} dispose={null} />
    <group ref={cup} name={`farkle-cup-${anchor.id}`} onPointerDown={e => {
      if (e.button !== 0 || !active || !canRollDice() || useDiceUI.getState().cup !== 'idle'
        || (useDiceUI.getState().boardView && !diceCamera.ready) || !root.current) return
      e.stopPropagation(); e.nativeEvent.preventDefault()
      const position = new Vector3(.91, 1.36, sign * .4)
      const height = root.current.localToWorld(position.clone()).y
      const projector = new CupDrag(camera, root.current, height)
      if (!projector.begin(e.clientX, e.clientY, gl.domElement.getBoundingClientRect(), position)) return
      gl.domElement.setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, scope: diceScope(), shake: new ShakeTracker(e.clientX, e.clientY), projector }
      cupMotion.x = .91; cupMotion.z = sign * .4; useDiceUI.setState({ cup: 'holding' }); gl.domElement.style.cursor = 'grabbing'
    }}><mesh geometry={cupGeometry} material={wood} dispose={null} /></group>
    {game?.dice.dice.map(die => <Die key={die.id} die={die} game={game} />)}
  </group>
}
