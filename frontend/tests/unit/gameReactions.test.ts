import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBindings } from '../../src/network/tableBindings'
import { TABLES } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { avatars, authoritativePose, estimatedServerTime, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { gameReaction, installGameReactions, reactionFor } from '../../src/world/gameReactions'
import { parseGameReaction } from '../../src/game/presentation/defeat'
import { useGame } from '../../src/game/store'
import { bridgeState } from '../fixtures/bridge'
import { useParkDebris } from '../../src/features/parkDebris/state'

const deployedBindings = parseBindings(JSON.parse(readFileSync('public/park-bindings.dev.json', 'utf8')).bindings)
const anchor = TABLES[0]!, tableId = 'mapped-table'
let serial = 0, gameId = '', version = 0
const position = (x = anchor.position[0], z = anchor.position[2]) => ({
  x, z, y: anchor.position[1] + .8, yaw: 0, moving: false, running: false, swimming: false, lastInputSeq: 0,
})
const emit = (type: string, payload: Record<string, unknown>, requestId: string | null = null) => receive({ type, payload, requestId })
function world(own = position(), target = position(anchor.position[0], anchor.position[2] - 1.8)) {
  emit('WORLD_STATE', { channelId: 'channel', version: ++version, mapVersion: EXPECTED_MAP_VERSION,
    avatars: [{ userId: '101', position: own }, { userId: '102', position: target }] })
}
const event = (patch: Record<string, unknown> = {}) => ({ eventId: gameId + ':reaction:102', gameId, tableId,
  channelId: 'channel', gameCode: 'LIAR_BRIDGE', version: 7, userId: '102', kind: 'DEFEAT',
  remainingBefore: 3, motion: 'head-clutch', durationMs: 3600, occurredAt: new Date(estimatedServerTime() - 300).toISOString(), ...patch })
const send = (patch: Record<string, unknown> = {}) => emit('WORLD_GAME_REACTION', event(patch))
beforeEach(() => {
  resetWorld(); serial++; gameId = 'network-game-' + serial; version = 0
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'channel', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  useSession.setState({ bindings: [{ channelId: 'channel', tableId, anchorId: anchor.id }],
    tables: [{ tableId, capacity: 4, occupiedSeats: 3, availableSeats: 1, joinable: false, gameCode: 'LIAR_BRIDGE',
      status: 'PLAYING', betAmountPerPlayer: 1 }] })
  world()
})
afterEach(() => { vi.restoreAllMocks(); resetWorld() })

it('shares park debris only for the current compatible channel and accepts newer full snapshots', () => {
  const item = {id:'debris-1',gameId,tableId,anchorId:anchor.id,gameCode:'OMOK',userId:'102',
    occurredAt:new Date(estimatedServerTime()-10000).toISOString(),throwYaw:0,seed:123,parts:['board','coin-0']}
  const snapshot = {channelId:'channel',mapVersion:EXPECTED_MAP_VERSION,version:1,items:[item]}
  for(const patch of [{channelId:'foreign'},{mapVersion:'old-map'}])emit('WORLD_PARK_DEBRIS_STATE',{...snapshot,...patch})
  emit('WORLD_PARK_DEBRIS_STATE',snapshot,'not-a-notification')
  expect(useParkDebris.getState().items).toEqual([])
  for(const patch of [{anchorId:'unknown'},{tableId:'wrong-binding'}])
    emit('WORLD_PARK_DEBRIS_STATE',{...snapshot,items:[{...item,...patch}]})
  expect(useParkDebris.getState().items).toEqual([])
  emit('WORLD_PARK_DEBRIS_STATE',snapshot)
  expect(useParkDebris.getState().items[0]?.parts).toEqual(['board','coin-0'])
  emit('WORLD_PARK_DEBRIS_STATE',{...snapshot,version:2,items:[{...item,parts:['board']}]})
  emit('WORLD_PARK_DEBRIS_STATE',snapshot)
  expect(useParkDebris.getState().items[0]?.parts).toEqual(['board'])
  emit('WORLD_PARK_DEBRIS_STATE',{...snapshot,version:3,items:[]})
  expect(useParkDebris.getState().items).toEqual([])
  resetWorld('reconnecting')
  emit('WORLD_PARK_DEBRIS_STATE',{...snapshot,version:4})
  expect(useParkDebris.getState()).toMatchObject({channelId:'',version:-1,items:[]})
})

it('clears retained park objects when map compatibility is lost', () => {
  emit('WORLD_PARK_DEBRIS_STATE',{channelId:'channel',mapVersion:EXPECTED_MAP_VERSION,version:1,items:[]})
  expect(useParkDebris.getState().channelId).toBe('channel')
  emit('WORLD_STATE',{channelId:'channel',version:++version,mapVersion:'old-map',avatars:[]})
  expect(useParkDebris.getState()).toMatchObject({channelId:'',version:-1,items:[]})
})

it('receives a nearby non-subscriber event without granting table/game/seat or changing authoritative positions', () => {
  const before = authoritativePose('102')
  expect(useSession.getState().tableStates).toEqual({}); expect(useGame.getState().game).toBeNull()
  send()
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())?.kind).toBe('head-clutch')
  expect(avatars.get('102')!.seatIndex).toBe(-1)
  expect(useSession.getState().tableId).toBe(''); expect(useSession.getState().watchedTableId).toBe('')
  expect(useGame.getState().watchedGameId).toBe('')
  expect(authoritativePose('102')).toEqual(before)
})
it.each([20, 20.01])('honors the inclusive 20m public recipient boundary at %im', distance => {
  world(position(anchor.position[0] + distance))
  send()
  expect(!!reactionFor('102')).toBe(distance === 20)
})
it.each(deployedBindings)('plays the real dev binding $anchorId at 20m and cancels beyond it without a game subscription', binding => {
  const mapped = TABLES.find(t => t.id === binding.anchorId)!
  resetWorld()
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: binding.channelId, name: '공원', version: 1,
    currentUsers: 2, capacity: 40, userIds: ['101', '102'] })
  useSession.setState({ bindings: deployedBindings,
    tables: deployedBindings.map(b => ({ tableId: b.tableId, capacity: 4, occupiedSeats: 3, availableSeats: 1,
      joinable: false, gameCode: 'LIAR_BRIDGE', status: 'PLAYING', betAmountPerPlayer: 1 })) })
  const publish = (distance: number) => emit('WORLD_STATE', { channelId: binding.channelId, version: ++version,
    mapVersion: EXPECTED_MAP_VERSION, avatars: [
      { userId: '101', position: { ...position(mapped.position[0] + distance, mapped.position[2]), y: mapped.position[1] + .8 } },
      { userId: '102', position: { ...position(mapped.position[0], mapped.position[2] - 1.8), y: mapped.position[1] + .8 } },
    ] })
  publish(20)
  const notification = event({ channelId: binding.channelId, tableId: binding.tableId })
  emit('WORLD_GAME_REACTION', notification)
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())).toMatchObject({
    anchorId: mapped.id, tableId: binding.tableId, kind: 'head-clutch',
  })
  expect(useSession.getState().tableId).toBe(''); expect(useSession.getState().watchedTableId).toBe('')
  expect(useGame.getState().watchedGameId).toBe(''); expect(avatars.get('102')!.seatIndex).toBe(-1)
  publish(20.01)
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())).toBeNull()
  emit('WORLD_GAME_REACTION', notification); expect(reactionFor('102')).toBeNull()
})
it('does not use the public distance restriction to exclude a confirmed participant', () => {
  world(position(anchor.position[0] + 21))
  useSession.setState({ tableId, seatIndex: 0 })
  send(); expect(reactionFor('102')).not.toBeNull()
})
it('ignores a foreign channel, unknown table/mapping, missing target, wrong target table or activity', () => {
  for (const patch of [{ channelId: 'foreign' }, { tableId: 'other' }, { userId: 'missing' }]) send(patch)
  expect(reactionFor('102')).toBeNull()
  avatars.get('102')!.tableId = 'another-anchor'; send(); expect(reactionFor('102')).toBeNull()
  avatars.get('102')!.tableId = ''; avatars.get('102')!.fitnessId = 'station'
  send(); expect(reactionFor('102')).toBeNull()
  avatars.get('102')!.fitnessId = ''; useSession.setState({ bindings: [] })
  send(); expect(reactionFor('102')).toBeNull()
})
it('rejects a malformed current-channel packet but keeps unsupported scopes harmless', () => {
  expect(() => send({ durationMs: 2800 })).toThrow()
  emit('WORLD_GAME_REACTION', event(), 'not-a-notification')
  expect(reactionFor('102')).toBeNull()
  useSession.setState({ mapCompatible: false }); send()
  expect(reactionFor('102')).toBeNull()
})
it('keeps the event timestamp and deduplicates repeated packets and alternate IDs for the same game/user', () => {
  const e = event(); emit('WORLD_GAME_REACTION', e); const first = reactionFor('102')
  emit('WORLD_GAME_REACTION', e); send({ eventId: 'alternate-id' })
  expect(reactionFor('102')).toBe(first)
  expect(first?.at).toBe(Date.parse(e.occurredAt))
  expect(parseGameReaction(e).version).toBe(7)
})
it('cancels on movement, never restarts on the delayed duplicate and can play a distinct next game', () => {
  const e = event(); emit('WORLD_GAME_REACTION', e)
  world(position(), { ...position(), moving: true })
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())).toBeNull()
  world(); emit('WORLD_GAME_REACTION', e); expect(reactionFor('102')).toBeNull()
  gameId += '-next'; send(); expect(reactionFor('102')).not.toBeNull()
})
it('cancels a stationary teleport and leaving the public radius, and removes expired reactions', () => {
  send(); world(position(), position(anchor.position[0] + 1))
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())).toBeNull()
  world(); gameId += '-radius'; send(); world(position(anchor.position[0] + 20.01))
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime())).toBeNull()
  world(); gameId += '-expires'; send()
  expect(gameReaction('102', avatars.get('102')!, estimatedServerTime() + 3600)).toBeNull()
})
it('clears playing on avatar removal, incompatible map and disconnect without replaying a received event', () => {
  const e = event(); emit('WORLD_GAME_REACTION', e)
  emit('WORLD_STATE', { channelId: 'channel', version: ++version, mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: '101', position: position() }] })
  expect(reactionFor('102')).toBeNull()
  world(); emit('WORLD_GAME_REACTION', e); expect(reactionFor('102')).toBeNull()
  gameId += '-map'; send()
  emit('WORLD_STATE', { channelId: 'channel', version: ++version, mapVersion: 'incompatible', avatars: [] })
  expect(reactionFor('102')).toBeNull()
  resetWorld('reconnecting'); expect(reactionFor('102')).toBeNull()
})
it('cancels a known old round on next GAME_STATE and a spectator on unwatch without inferring any new loss', () => {
  const dispose = installGameReactions()
  try {
    useGame.setState({ game: { gameId, version: 1, role: 'PLAYER', bridge: bridgeState(4), secret: null } })
    send()
    useGame.setState({ game: { gameId: 'next', version: 1, role: 'PLAYER', bridge: bridgeState(4), secret: null } })
    expect(reactionFor('102')).toBeNull()
    gameId += '-watch'; useSession.setState({ watchedTableId: tableId }); send()
    useSession.setState({ watchedTableId: '' }); expect(reactionFor('102')).toBeNull()
  } finally { dispose() }
})
it('ignores expired and excessive future notifications', () => {
  send({ occurredAt: new Date(estimatedServerTime() - 3600).toISOString() }); expect(reactionFor('102')).toBeNull()
  send({ occurredAt: new Date(estimatedServerTime() + 60000).toISOString() }); expect(reactionFor('102')).toBeNull()
})
it('uses CONNECTED UTC plus monotonic elapsed time despite a skewed/changing device wall clock', () => {
  const serverNow = Date.now() + 600000
  emit('CONNECTED', { userId: '101', time: { serverNow } })
  const before = estimatedServerTime()
  vi.spyOn(Date, 'now').mockReturnValue(serverNow + 3600000)
  expect(estimatedServerTime() - before).toBeLessThan(100)
  send({ occurredAt: new Date(serverNow - 300).toISOString() })
  expect(reactionFor('102')?.at).toBe(serverNow - 300)
})
