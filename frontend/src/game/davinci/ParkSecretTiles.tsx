import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { avatars, useSession } from '../../network/worldClient'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { tableSeats, type TableAnchor } from '../../park/tablePlacement'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import { Tile } from './DavinciBoard'
import { openingActive, openingElapsed, openingPose, useSecretTileUI } from './presentation'
import { useDavinciPing } from './social'
import type { CodePlayer, CodeTile, DavinciState } from './protocol'

const SCALE = .18
const POSITIONS: [number, number, number][] = [[0, .11, 2.85], [-3.7, .11, 0], [0, .11, -2.85], [3.7, .11, 0]]
const YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
const noop = () => {}

function slotFor(anchor: TableAnchor, player: CodePlayer) {
  const seats = tableSeats(anchor), seat = seats[avatars.get(player.userId)?.seatIndex ?? player.seat] ?? seats[0]!
  return Math.abs(seat.z) >= Math.abs(seat.x) ? seat.z > 0 ? 0 : 2 : seat.x < 0 ? 1 : 3
}

function Opening({ state, anchor }: { state: DavinciState; anchor: TableAnchor }) {
  const root = useRef<Group>(null)
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  useFrame(() => {
    const elapsed = openingElapsed(state), deal = Math.min(1, Math.max(0, (elapsed - 3000) / 1200))
    const ease = 1 - (1 - deal) ** 3
    const each = state.players.length === 4 ? 3 : 4, dealt = state.players.length * each
    root.current?.children.forEach((node, i) => {
      const from = openingPose(i, reduced.current ? 0 : Math.min(3000, elapsed))
      let x: number, z: number, yaw = 0
      if (i < dealt) {
        const player = state.players[Math.floor(i / each)]!, slot = slotFor(anchor, player), pos = POSITIONS[slot]!
        const offset = (i % each - (each - 1) / 2) * .76
        yaw = YAW[slot]!; x = pos[0] + Math.cos(yaw) * offset; z = pos[2] - Math.sin(yaw) * offset
      } else { const j = i - dealt; x = (j % 6 - 2.5) * .6; z = (Math.floor(j / 6) - 1) * .5 }
      node.position.set(from.x * (1 - ease) + x * ease, from.y * (1 - ease) + .2 * ease, from.z * (1 - ease) + z * ease)
      node.rotation.y = from.yaw * (1 - ease) + yaw * ease
    })
  })
  return <group ref={root} name="secret-tiles-shuffling">{Array.from({ length: 26 }, (_, i) => <group key={i}>
    <Tile tile={{ id: `opening-${i}`, color: i % 2 ? 'WHITE' : 'BLACK', value: null, revealed: false }}
      hidden flat faceUp={false} selected={false} clickable={false} scale={.8} onClick={noop} />
  </group>)}</group>
}

/** 공원 Canvas의 실제 타일. 개인 숫자는 본인의 클라이언트에서만 텍스처로 만든다. */
export function ParkSecretTiles({ anchor }: { anchor: TableAnchor }) {
  const own = useSession(s => s.sessionId), runtime = useParkRuntime()
  const context = useSession(useShallow(s => ({ room: s.roomId, bindings: s.bindings, publicTables: s.publicTables,
    tableId: s.tableId, watched: s.watchedTableId, pending: s.pending, connected: s.status === 'connected' })))
  const g = useGame(), selected = useSecretTileUI(s => s.selection), ping = useDavinciPing(s => s.ping)
  const code = useTableGameCode(anchor.id), [, update] = useState(0)
  const binding = context.bindings.find(b => b.channelId === context.room && b.anchorId === anchor.id)
  const relevant = !!binding && (g.game?.role === 'PLAYER' ? context.tableId : context.watched) === binding.tableId && !!g.game?.davinci
  const world = binding ? context.publicTables?.[binding.tableId]?.secretTiles : null
  const state = relevant ? g.game!.davinci! : world?.state
  const gameId = relevant ? g.game!.gameId : world?.gameId ?? ''
  const opening = !!state && openingActive(state)
  useEffect(() => { if (!opening) return; const timer = setInterval(() => update(n => n + 1), 80); return () => clearInterval(timer) }, [opening])
  if (code !== 'DAVINCI_CODE' || !binding) return null
  const hand = relevant && g.game?.role === 'PLAYER' ? g.game.davinciHand : null
  const enabled = relevant && !!state && context.connected && !context.pending && !g.pending && !g.uncertain
    && g.recovery === 'RESTORED' && g.game!.version >= g.awaitingVersion && !forfeitBlocksInput(gameId)
    && state.turnUserId === own && !opening && state.status === 'PLAYING'
  const canPing = relevant && g.game?.role === 'SPECTATOR' && state?.status === 'PLAYING' && state.stage !== 'SETUP'
  const pick = (userId: string, tileId: string) => {
    if (canPing) void runtime.pingDavinci?.(userId, tileId)
    else useSecretTileUI.getState().pick(gameId, state!.version, userId, tileId)
  }
  return <group name="secret-tiles-park-table" position={[0, 1.08, 0]} scale={SCALE} userData={{ gameId, opening }}>
    <mesh position={[0, -.025, 0]}><boxGeometry args={[9.8, .035, 7.15]} /><meshStandardMaterial color="#274d38" roughness={1} /></mesh>
    {opening && state ? <Opening state={state} anchor={anchor} /> : state ? <>
      {state.players.map(player => {
        const slot = slotFor(anchor, player), ownRow = !!hand && player.userId === own
        const tiles = ownRow ? hand.tiles : state.stage === 'SETUP'
          ? Array.from({ length: player.tileCount }, (_, i): CodeTile => ({ id: `setup-${player.userId}-${i}`, color: i % 2 ? 'WHITE' : 'BLACK', value: null, revealed: false })) : player.tiles
        const scale = Math.min(1.2, (slot % 2 ? 4.8 : 7.1) / Math.max(1, tiles.length * .69))
        return <group key={player.userId} position={POSITIONS[slot]} rotation={[0, YAW[slot]!, 0]}>
          {tiles.map((tile, i) => <group key={tile.id} name="secret-tile" userData={{ userId: player.userId, tileId: tile.id }} position={[(i - (tiles.length - 1) / 2) * .69 * scale, 0, 0]}>
            <Tile tile={tile} hidden={tile.value === null} faceUp={tile.revealed} scale={scale}
              selected={selected?.gameId === gameId && selected.version === state.version && selected.tileId === tile.id
                || ping?.gameId === gameId && ping.basedOnVersion === state.version && ping.tileId === tile.id && ping.until > Date.now()}
              clickable={!!canPing || enabled && player.active && !tile.revealed && (ownRow ? state.stage === 'REVEAL' : ['GUESS','CONTINUE'].includes(state.stage))}
              onClick={() => pick(player.userId, tile.id)} />
          </group>)}
        </group>
      })}
      {state.supply.map((tile, i) => <group key={tile.id} name="secret-supply-tile" userData={{ tileId: tile.id }} position={[(i % 6 - 2.5) * .6, .18, (Math.floor(i / 6) - 1.1) * .5]} rotation={[0, Math.sin(i * 4.2) * .14, 0]}>
        <Tile tile={{ ...tile, value: null, revealed: false }} hidden flat faceUp={false} selected={false} scale={.66}
          clickable={enabled && state.stage === 'DRAW'} onClick={() => void runtime.actDavinci?.({ kind: 'draw', tileId: tile.id })} />
      </group>)}
    </> : <>{Array.from({ length: 12 }, (_, i) => <group key={i} position={[(i % 6 - 2.5) * .75, .2, (Math.floor(i / 6) - .5) * .7]}>
      <Tile tile={{ id:`idle-${i}`,color:i % 2 ? 'WHITE':'BLACK',value:null,revealed:false }} hidden flat faceUp={false} selected={false} clickable={false} scale={.8} onClick={noop} />
    </group>)}</>}
  </group>
}
