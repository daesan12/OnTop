import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { Euler, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3, type Group, type Mesh } from 'three'
import type { TableAnchor } from '../../config'
import { tableSeats } from '../../park/mapConfig'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useGame } from '../store'
import type { LedgerGame } from '../protocol'
import { BoneDie, LeatherCup, OakTray, farkleArt } from '../farkle/art/FarkleProps'
import { preloadCraftMaps } from '../farkle/art/CraftMaterials'
import { DIE_REST_Y, FARKLE_VISUAL } from '../farkle/presentation'
import { createCupPour, dieFlightProgress, sampleCupPour, sampleDiePour, POUR, type CupPour } from '../farkle/pour'
import { diceSound } from '../farkle/sound'
import { TABLET_ENABLED } from '../../features/tableLobby/tabletFeature'
import { keptDice, LEDGER_ROLL_MS, toggleKeep, useLedgerUI } from './controls'
import { useLedgerPings } from './pings'
import type { LedgerDie } from './protocol'

// Same bone atlas as the dice game: opposite faces sum to seven.
const normals = [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)]
const finalRotations = normals.map(n => new Quaternion().setFromUnitVectors(n, new Vector3(0, 1, 0)))
const ring = new TorusGeometry(.119, .006, 4, 24)
const keepMaterial = new MeshBasicMaterial({ color: '#f4c86a' }), hintMaterial = new MeshBasicMaterial({ color: '#7cc7ff' })
const noRaycast = () => {}
const CUP = { x: .91, z: .4 } as const
/** Client-only layout: rolled dice in the back row, kept dice in the front row nearest the viewer. */
export const ledgerDieSpot = (id: number, kept: boolean) => ({ x: -.5 + id * .25, z: kept ? .26 : -.14 })

function Die({ die, game, pour }: { die: LedgerDie; game: LedgerGame; pour: CupPour }) {
  const root = useRef<Group>(null), shadow = useRef<Mesh>(null), keepRing = useRef<Mesh>(null), hintRing = useRef<Mesh>(null)
  const rotation = useRef(new Quaternion()), euler = useRef(new Euler()), rest = useRef(new Vector3()), art = farkleArt(), runtime = useParkRuntime()
  useFrame(() => {
    if (!root.current) return
    const ui = useLedgerUI.getState(), player = game.role === 'PLAYER'
    const kept = player ? keptDice().includes(die.id) : die.held
    const p = die.held || !ui.animationAt ? 1 : Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / LEDGER_ROLL_MS))
    const { x, z } = ledgerDieSpot(die.id, kept), t = 1 - (1 - dieFlightProgress(p)) ** 3
    root.current.visible = p >= POUR.release
    if (p < 1) sampleDiePour(pour, p, x, z, root.current.position)
    else root.current.position.lerp(rest.current.set(x, DIE_REST_Y, z), .25)
    rotation.current.setFromEuler(euler.current.set((1 - t) * (10 + die.id), (1 - t) * (8 + die.id * 2), (1 - t) * 5))
    root.current.quaternion.copy(rotation.current).multiply(finalRotations[die.value - 1]!)
    const hinted = useLedgerPings.getState().pings.some(ping => ping.dieId === die.id)
    if (shadow.current) { shadow.current.visible = root.current.visible; shadow.current.position.set(root.current.position.x, 1.1005, root.current.position.z) }
    if (keepRing.current) { keepRing.current.visible = kept && root.current.visible; keepRing.current.position.set(root.current.position.x, 1.108, root.current.position.z) }
    if (hintRing.current) {
      hintRing.current.visible = hinted && root.current.visible
      hintRing.current.position.set(root.current.position.x, 1.112, root.current.position.z)
      hintRing.current.scale.setScalar(FARKLE_VISUAL.dieScale * (1.25 + Math.sin(performance.now() / 120) * .06))
    }
  })
  return <group>
    <mesh ref={shadow} geometry={art.contactPlane} material={art.contact} raycast={noRaycast} dispose={null} />
    <group ref={root} position={[ledgerDieSpot(die.id, die.held).x, DIE_REST_Y, ledgerDieSpot(die.id, die.held).z]}
      scale={FARKLE_VISUAL.dieScale} name={`ledger-die-${die.id}`} userData={{ face: die.value, held: die.held }} onClick={e => {
        e.stopPropagation()
        const current = useGame.getState().game
        if (current?.gameId !== game.gameId || current.version !== game.version) return
        if (game.role === 'PLAYER') toggleKeep(die.id)
        else if (useLedgerPings.getState().canSend) void runtime.pingLedger({ dieId: die.id })
      }}><BoneDie id={die.id} /></group>
    <mesh ref={keepRing} geometry={ring} material={keepMaterial} rotation={[-Math.PI / 2, 0, 0]} scale={FARKLE_VISUAL.dieScale} raycast={noRaycast} dispose={null} />
    <mesh ref={hintRing} geometry={ring} material={hintMaterial} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} dispose={null} />
  </group>
}

export function LedgerTable({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId,
    watchedTableId: s.watchedTableId, tableStates: s.tableStates, seatIndex: s.seatIndex }))), g = useGame(s => s.game?.ledger ? s.game : null)
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!binding && !!g && (session.tableId === binding.tableId || (g.role === 'SPECTATOR' && session.watchedTableId === binding.tableId))
  const selected = !!binding && session.tableStates[binding.tableId]?.gameCode === 'DICE_LEDGER'
  useEffect(() => { if (selected) preloadCraftMaps() }, [selected])
  if (!relevant && !selected) return null
  if (TABLET_ENABLED && !relevant) return null
  // 참가자는 자기 좌석 쪽에 보관 줄이 오도록 판을 돌린다. 관전자는 기본 방향으로 본다.
  const seat = relevant && g?.role === 'PLAYER' ? tableSeats(anchor)[session.seatIndex] : undefined
  return <LedgerSurface anchor={anchor} game={relevant ? g : null} yaw={seat ? Math.atan2(seat.x, seat.z) : 0} />
}

function LedgerSurface({ anchor, game, yaw }: { anchor: TableAnchor; game: LedgerGame | null; yaw: number }) {
  const cup = useRef<Group>(null), soundFrame = useRef({ animationAt: 0, bump: -1 })
  const pour = useMemo(() => createCupPour(CUP.x, FARKLE_VISUAL.cupRestY, CUP.z, 1), [game?.gameId, game?.ledger.rollId])
  useFrame(() => {
    if (!cup.current) return
    const ui = useLedgerUI.getState()
    const progress = game?.ledger.dice.length && ui.animationAt ? Math.min(1, Math.max(0, (performance.now() - ui.animationAt) / LEDGER_ROLL_MS)) : 1
    if (game && progress < 1) {
      const bump = Math.floor((performance.now() - ui.animationAt) / 210)
      if (soundFrame.current.animationAt !== ui.animationAt || soundFrame.current.bump !== bump) {
        soundFrame.current = { animationAt: ui.animationAt, bump }; diceSound(1 - progress)
      }
      sampleCupPour(pour, progress, cup.current.position, cup.current.quaternion)
    } else {
      cup.current.position.set(CUP.x, FARKLE_VISUAL.cupRestY, CUP.z); cup.current.rotation.set(0, 0, 0)
    }
  })
  return <group name={`ledger-table-${anchor.id}`} scale={FARKLE_VISUAL.tabletopScale} rotation={[0, yaw, 0]}
    position={[0, 1.06 * (1 - FARKLE_VISUAL.tabletopScale), 0]}>
    <OakTray />
    <group ref={cup} name={`ledger-cup-${anchor.id}`}><LeatherCup /></group>
    {game?.ledger.dice.map(die => <Die key={die.id} die={die} game={game} pour={pour} />)}
  </group>
}
