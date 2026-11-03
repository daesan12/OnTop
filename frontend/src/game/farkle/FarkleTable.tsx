import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { Euler, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3, type Group, type Mesh } from 'three'
import type { TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import type { DiceGame, Farkle } from '../protocol'
import { cupMotion, useDiceUI, diceCamera, canRollDice, diceCanAct, diceScope, cancelCup, rollDice, selectedDice, toggleDie } from './controls'
import { CupDrag } from './cupDrag'
import { ShakeTracker } from './shake'
import { diceSound, unlockDiceSound } from './sound'

import { BoneDie, LeatherCup, OakTray, farkleArt } from './art/FarkleProps'
import { DIE_REST_Y, FARKLE_VISUAL } from './presentation'
import { createCupPour, sampleCupPour, sampleDiePour, dieFlightProgress, POUR, type CupPour } from './pour'
import { TABLET_ENABLED } from '../../features/tableLobby/tabletFeature'
import { FarkleHourglass } from './FarkleHourglass'
import { FarkleScorebook } from './FarkleScorebook'
import { preloadCraftMaps } from './art/CraftMaterials'
import { bustMatches, DICE_ROLL_MS, type BustPresentation } from './bustPresentation'
import { scenePointerOwners } from '../../world/inputOwnership'

// Matches the original six-face bone atlas, with opposite faces summing to seven.
const normals = [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)]
const finalRotations = normals.map(n => new Quaternion().setFromUnitVectors(n, new Vector3(0, 1, 0)))
const ring = new TorusGeometry(.119, .006, 4, 24), selectionMaterial = new MeshBasicMaterial({ color: '#f4c86a' })
const noRaycast = () => {}
function Die({ die, game, pour }: { die: Farkle['dice'][number]; game: DiceGame; pour: CupPour }) {
  const root = useRef<Group>(null), shadow = useRef<Mesh>(null), selectedRing = useRef<Mesh>(null)
  const rotation = useRef(new Quaternion()), euler = useRef(new Euler()), art = farkleArt()
  useFrame(() => {
    if (!root.current) return
    const ui = useDiceUI.getState(), p = die.held || !ui.animationAt ? 1 : Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / DICE_ROLL_MS))
    const x = die.held ? -.68 : -.36 + die.id % 3 * .35, z = die.held ? -.4 + die.id * .16 : -.22 + Math.floor(die.id / 3) * .43
    const selected = selectedDice().includes(die.id), t = 1 - (1 - dieFlightProgress(p)) ** 3
    root.current.visible = p >= POUR.release
    if (p < 1) sampleDiePour(pour, p, x, z, root.current.position)
    else root.current.position.set(x, DIE_REST_Y + (selected ? .035 : 0), z)
    rotation.current.setFromEuler(euler.current.set((1 - t) * (10 + die.id), (1 - t) * (8 + die.id * 2), (1 - t) * 5))
    root.current.quaternion.copy(rotation.current).multiply(finalRotations[die.value - 1]!)
    if (shadow.current) { shadow.current.visible = root.current.visible; shadow.current.position.set(root.current.position.x, 1.1005, root.current.position.z) }
    if (selectedRing.current) { selectedRing.current.visible = selected && root.current.visible; selectedRing.current.position.set(x, 1.108, z) }
  })
  return <group>
    <mesh ref={shadow} geometry={art.contactPlane} material={art.contact} raycast={noRaycast} dispose={null} />
    <group ref={root} scale={FARKLE_VISUAL.dieScale} name={`farkle-die-${die.id}`} userData={{ face: die.value, held: die.held }}
      onPointerDown={e => { if (e.button === 0) { e.stopPropagation(); scenePointerOwners.set(e.pointerId, 'farkle-die') } }} onClick={e => {
      e.stopPropagation(); const current = useGame.getState().game
      if (diceCamera.ready && current?.gameId === game.gameId && current.version === game.version) toggleDie(die.id)
    }}><BoneDie id={die.id} /></group>
    <mesh ref={selectedRing} geometry={ring} material={selectionMaterial} rotation={[-Math.PI / 2, 0, 0]} scale={FARKLE_VISUAL.dieScale} raycast={noRaycast} dispose={null} />
  </group>
}
/** Unconfirmed motion only: never settle on, label or expose a fabricated result face. */
function BustRollingDie({ id, bust, pour }: { id: number; bust: BustPresentation; pour: CupPour }) {
  const root = useRef<Group>(null)
  useFrame(() => {
    if (!root.current) return
    const progress = Math.max(0, (performance.now() - bust.at) / DICE_ROLL_MS)
    root.current.visible = progress >= POUR.release && progress < 1
    if (!root.current.visible) return
    sampleDiePour(pour, progress, -.36 + id % 3 * .35, -.22 + Math.floor(id / 3) * .43, root.current.position)
    root.current.rotation.set(progress * 18 + id, progress * 15 + id * 2, progress * 13)
    root.current.scale.setScalar(FARKLE_VISUAL.dieScale * Math.min(1, (1 - progress) / .12))
  })
  return <group ref={root} name={`farkle-rolling-die-${id}`} userData={{ presentationOnly: true }}><BoneDie id={id} /></group>
}
export function FarkleTable({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId,
    watchedTableId: s.watchedTableId, tableStates: s.tableStates }))), g = useGame(s => s.game?.dice ? s.game : null)
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!binding && !!g && (session.tableId === binding.tableId || (g.role === 'SPECTATOR' && session.watchedTableId === binding.tableId))
  const selected = !!binding && session.tableStates[binding.tableId]?.gameCode === 'DICE'
  useEffect(() => { if (selected) preloadCraftMaps() }, [selected])
  if (!relevant && !selected) return null
  if (TABLET_ENABLED && !relevant) return null
  return <FarkleSurface anchor={anchor} game={relevant ? g : null} />
}
function FarkleSurface({ anchor, game }: { anchor: TableAnchor; game: DiceGame | null }) {
  const pendingBust = useDiceUI(s => s.bust), bust = bustMatches(game, pendingBust) ? pendingBust : null
  const root = useRef<Group>(null), cup = useRef<Group>(null), drag = useRef<{ scope: string; id: number; shake: ShakeTracker; projector: CupDrag; x: number; y: number } | null>(null)
  const soundFrame = useRef({ animationAt: 0, bump: -1 })
  const { gl, camera } = useThree()
  const own = useSession(s => s.sessionId), sign = game?.dice.players.indexOf(own) === 1 ? -1 : 1
  const active = !!game && game.role === 'PLAYER'
  const released = useRef<{ gameId: string; rollId: number; x: number; y: number; z: number } | null>(null)
  const pour = useMemo(() => {
    const origin = released.current
    if (origin && origin.gameId === game?.gameId && origin.rollId === game?.dice.rollId) return createCupPour(origin.x, origin.y, origin.z, 1)
    return createCupPour(.91, FARKLE_VISUAL.cupRestY, .4, 1)
  }, [game?.gameId, game?.dice.rollId, sign])
  useEffect(() => {
    if (!active) return
    const cancel = () => {
      const current = drag.current; drag.current = null
      if (current) { scenePointerOwners.delete(current.id); try { gl.domElement.releasePointerCapture(current.id) } catch {} }
      gl.domElement.style.cursor = ''; cupMotion.lift = 0
    }
    cupMotion.cancel = cancel
    const move = (e: PointerEvent) => {
      const current = drag.current
      if (!current || e.pointerId !== current.id) return
      if (!diceCanAct() || current.scope !== diceScope()) { cancelCup(); return }
      const point = current.projector.move(e.clientX, e.clientY, gl.domElement.getBoundingClientRect())
      cupMotion.x = point.x; cupMotion.z = point.z
      diceSound(Math.hypot(e.clientX - current.x, e.clientY - current.y) / 20)
      current.x = e.clientX; current.y = e.clientY
      if (current.shake.move(e.clientX, e.clientY) && useDiceUI.getState().cup !== 'ready') useDiceUI.setState({ cup: 'ready' })
    }
    const up = (e: PointerEvent) => {
      const current = drag.current
      if (!current || e.pointerId !== current.id) return
      const shouldRoll = current.scope === diceScope() && useDiceUI.getState().cup === 'ready' && canRollDice()
      if (shouldRoll && game) released.current = { gameId: game.gameId, rollId: game.dice.rollId + 1, x: cupMotion.x, y: 1.36, z: cupMotion.z }
      cancelCup()
      if (shouldRoll) rollDice()
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelCup)
    return () => { cancel(); if (cupMotion.cancel === cancel) cupMotion.cancel = () => {}
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelCup) }
  }, [active, gl, game?.gameId, game?.dice.rollId])
  useFrame(() => {
    if (!cup.current) return
    const ui = useDiceUI.getState()
    if (active && ui.cup !== 'idle' && !diceCanAct()) cancelCup()
    const held = active && ui.cup !== 'idle'
    const progress = game?.dice && ui.animationAt ? Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / DICE_ROLL_MS)) : 1
    if (game && progress < 1) {
      const bump = Math.floor((performance.now() - ui.animationAt) / 210)
      if (soundFrame.current.animationAt !== ui.animationAt || soundFrame.current.bump !== bump) {
        soundFrame.current = { animationAt: ui.animationAt, bump }; diceSound(1 - progress)
      }
    }
    if (!held && progress < 1) sampleCupPour(pour, progress, cup.current.position, cup.current.quaternion)
    else { cup.current.position.set(held ? cupMotion.x : .91, held ? 1.36 : FARKLE_VISUAL.cupRestY, held ? cupMotion.z : .4)
      cup.current.rotation.set(0, 0, held ? Math.sin(performance.now() / 80) * .08 : 0) }
  })
  return <group>
    {active && game.dice.status === 'PLAYING' && <FarkleScorebook side={sign} active={active} />}
    <group ref={root} name={`farkle-table-${anchor.id}`} scale={FARKLE_VISUAL.tabletopScale} rotation={[0, sign < 0 ? Math.PI : 0, 0]}
      position={[FARKLE_VISUAL.tabletopOffsetX * sign, 1.06 * (1 - FARKLE_VISUAL.tabletopScale), 0]}>
    <OakTray />
    {game?.dice.status === 'PLAYING' && <FarkleHourglass game={game} side={1} />}
    <group ref={cup} name={`farkle-cup-${anchor.id}`} onPointerDown={e => {
      if (e.button === 0 && active) { e.stopPropagation(); scenePointerOwners.set(e.pointerId, 'farkle-cup') }
      if (e.button !== 0 || !active || !canRollDice() || useDiceUI.getState().cup !== 'idle'
        || !diceCamera.ready || !root.current) return
      e.stopPropagation()
      const position = new Vector3(.91, 1.36, .4)
      const height = root.current.localToWorld(position.clone()).y
      const projector = new CupDrag(camera, root.current, height)
      if (!projector.begin(e.clientX, e.clientY, gl.domElement.getBoundingClientRect(), position)) return
      gl.domElement.setPointerCapture(e.pointerId)
      unlockDiceSound()
      drag.current = { id: e.pointerId, scope: diceScope(), shake: new ShakeTracker(e.clientX, e.clientY), projector, x: e.clientX, y: e.clientY }
      cupMotion.x = .91; cupMotion.z = .4; useDiceUI.setState({ cup: 'holding' }); gl.domElement.style.cursor = 'grabbing'
    }}><LeatherCup /></group>
    {game?.dice.dice.map(die => <Die key={die.id} die={die} game={game} pour={pour} />)}
    {bust?.phase === 'rolling' && bust.rollingIds.map(id => <BustRollingDie key={id} id={id} bust={bust} pour={pour} />)}
  </group></group>
}
