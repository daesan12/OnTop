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
import { DRAW_MS, flightPose, pendingPose, rowPose, supplyPose, uniformTileScale } from './layout'
import { noteLiveMatch, type TileReaction } from './effects'
import { useTableEffects } from './useTableEffects'
import { TileMotion } from './TileMotion'
import { DrawFlight } from './DrawFlight'

const SCALE = .18
const noop = () => {}

function slotFor(anchor: TableAnchor, player: CodePlayer) {
  const seats = tableSeats(anchor), seat = seats[avatars.get(player.userId)?.seatIndex ?? player.seat] ?? seats[0]!
  return Math.abs(seat.z) >= Math.abs(seat.x) ? seat.z > 0 ? 0 : 2 : seat.x < 0 ? 1 : 3
}

function Opening({ state, anchor, scale }: { state: DavinciState; anchor: TableAnchor; scale: number }) {
  const root = useRef<Group>(null)
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  useFrame(() => {
    const elapsed = openingElapsed(state), deal = Math.min(1, Math.max(0, (elapsed - 3000) / 1200))
    const ease = reduced.current ? deal > 0 ? 1 : 0 : 1 - (1 - deal) ** 3
    const each = state.players.length === 4 ? 3 : 4, dealt = state.players.length * each
    root.current?.children.forEach((node, i) => {
      const from = openingPose(i, reduced.current ? 0 : Math.min(3000, elapsed))
      let target
      if (i < dealt) {
        const player = state.players[Math.floor(i / each)]!
        target = rowPose(slotFor(anchor, player), i % each, each, scale)
      } else target = supplyPose(i - dealt, 26 - dealt, scale)
      node.position.set(from.x * (1 - ease) + target.x * ease, from.y * (1 - ease) + target.y * ease, from.z * (1 - ease) + target.z * ease)
      node.rotation.set(Math.PI / 2 * (1 - ease) + target.tilt * ease, from.yaw * (1 - ease) + target.yaw * ease, 0, 'YXZ')
    })
  })
  return <group ref={root} name="secret-tiles-shuffling">{Array.from({ length: 26 }, (_, i) => <group key={i}>
    <Tile tile={{ id: `opening-${i}`, color: i % 2 ? 'WHITE' : 'BLACK', value: null, revealed: false }}
      hidden faceUp={false} selected={false} clickable={false} scale={scale} onClick={noop} />
  </group>)}</group>
}

/** 공원 Canvas의 실제 타일. 개인 숫자는 본인의 클라이언트에서만 텍스처로 만든다. */
export function ParkSecretTiles({ anchor, heightScale = 1 }: { anchor: TableAnchor; heightScale?: number }) {
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
  const scale = uniformTileScale(state?.players.map(p => ({ slot: slotFor(anchor, p), count: p.tileCount + (state.stage === 'PLACE_TILE' && state.turnUserId === p.userId ? 1 : 0) })) ?? [])
  const visual = useTableEffects(gameId, state, scale, context.connected && (!relevant || !g.uncertain && g.recovery === 'RESTORED'), relevant)
  const lastLive = useRef(0)
  useFrame(() => {
    if (relevant && context.connected && state?.status === 'PLAYING' && Date.now() - lastLive.current > 500) {
      noteLiveMatch(gameId); lastLive.current = Date.now()
    }
  })
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
  // 공통 테이블의 X/Z 전용 배율을 Y에도 맞춰, 누운 중앙 패와 선 손패가 실제 월드 크기까지 같도록 한다.
  return <group name="secret-tiles-park-table" position={[0, 1.08, 0]} scale={[SCALE, SCALE * heightScale, SCALE]} userData={{ gameId, opening }}>
    <mesh position={[0, -.025, 0]}><boxGeometry args={[9.8, .035, 7.15]} /><meshStandardMaterial color="#274d38" roughness={1} /></mesh>
    {opening && state ? <Opening state={state} anchor={anchor} scale={scale} /> : state ? <>
      {state.players.map(player => {
        const slot = slotFor(anchor, player), ownRow = !!hand && player.userId === own
        const tiles = ownRow ? hand.tiles : state.stage === 'SETUP'
          ? Array.from({ length: player.tileCount }, (_, i): CodeTile => ({ id: `setup-${player.userId}-${i}`, color: i % 2 ? 'WHITE' : 'BLACK', value: null, revealed: false })) : player.tiles
        return <group key={player.userId}>
          {tiles.map((tile, i) => {
            const from = visual.draw?.tileId === tile.id ? flightPose(visual.draw.from, pendingPose(slot), (performance.now() - visual.draw.started) / DRAW_MS) : undefined
            const reaction: TileReaction | undefined = visual.guess?.tileId === tile.id ? { kind: visual.guess.correct ? 'correct' : 'wrong', started: visual.guess.started }
              : visual.guess && !visual.guess.correct && visual.guess.actor === player.userId
                && (state.stage === 'REVEAL' && !tile.revealed || visual.draw?.tileId === tile.id) ? { kind: 'penalty', started: visual.guess.started } : undefined
            return <TileMotion key={tile.id} name="secret-tile" tileId={tile.id} userId={player.userId} pose={rowPose(slot, i, tiles.length, scale)} from={from}>
            <Tile tile={tile} hidden={tile.value === null} faceUp={tile.revealed} scale={scale}
              reaction={reaction}
              selected={selected?.gameId === gameId && selected.version === state.version && selected.tileId === tile.id
                || ping?.gameId === gameId && ping.basedOnVersion === state.version && ping.tileId === tile.id && ping.until > Date.now()}
              clickable={!!canPing || enabled && player.active && !tile.revealed && (ownRow ? state.stage === 'REVEAL' : ['GUESS','CONTINUE'].includes(state.stage))}
              onClick={() => pick(player.userId, tile.id)} />
          </TileMotion>})}
        </group>
      })}
      {visual.draw && state.stage === 'PLACE_TILE' && state.lastEvent?.tileId === visual.draw.tileId && <DrawFlight key={visual.draw.started} draw={visual.draw}
        slot={slotFor(anchor, state.players.find(p => p.userId === visual.draw!.actor)!)} scale={scale} tile={hand?.pendingTile ?? null} />}
      {state.supply.map((tile, i) => <TileMotion key={tile.id} name="secret-supply-tile" tileId={tile.id} pose={supplyPose(i, state.supply.length, scale)}>
        <Tile tile={{ ...tile, value: null, revealed: false }} hidden faceUp={false} selected={false} scale={scale}
          clickable={enabled && state.stage === 'DRAW'} onClick={() => void runtime.actDavinci?.({ kind: 'draw', tileId: tile.id })} />
      </TileMotion>)}
    </> : <>{Array.from({ length: 12 }, (_, i) => <group key={i} position={[(i % 6 - 2.5) * .75, .2, (Math.floor(i / 6) - .5) * .7]}>
      <Tile tile={{ id:`idle-${i}`,color:i % 2 ? 'WHITE':'BLACK',value:null,revealed:false }} hidden flat faceUp={false} selected={false} clickable={false} scale={1} onClick={noop} />
    </group>)}</>}
  </group>
}
