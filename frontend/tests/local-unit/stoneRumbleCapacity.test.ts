import { describe, expect, it } from 'vitest'
import snapshot from '../fixtures/stone-rumble-eight.json'
import { gamePlayers, parseGame, parseResult } from '../../src/game/protocol'
import { parseStoneState } from '../../src/game/stone-rumble/protocol'
import { parseGameReaction } from '../../src/game/presentation/defeat'
import { STONE_TILE_COUNTS, STONE_TILE_SIZE, visibleStoneFloor } from '../../src/game/stone-rumble/layout'

describe('돌탑 8인 서버 계약', () => {
  it('로딩 준비 인원과 공동 순위 보상을 읽고 잘못된 참가자·금액을 거절한다', () => {
    expect(parseStoneState({ ...snapshot, phase: 'LOADING', readyUserIds: ['101', '202'] }).readyUserIds).toHaveLength(2)
    expect(() => parseStoneState({ ...snapshot, phase: 'LOADING', readyUserIds: ['999'] })).toThrow()
    const result = { version: 1, gameSessionId: '7', gameCode: 'STONE_RUMBLE', status: 'FINISHED', endReason: 'ALL_FALLEN',
      settlementStatus: 'SETTLED', betAmountPerPlayer: 0, myCoinDelta: 15, endedAt: '2026-11-07T00:00:00Z',
      participants: [{ userId: '101', result: 'DRAW', rank: 1, rewardCoins: 15 }, { userId: '202', result: 'DRAW', rank: 1, rewardCoins: 15 }] }
    expect(parseResult(result, '101').participants[0]).toEqual(result.participants[0])
    const capped = { ...result, myCoinDelta: 7, participants: [
      { ...result.participants[0], rewardCoins: 7 }, { ...result.participants[1], rewardCoins: 0 },
    ] }
    expect(parseResult(capped, '101').participants.map(player => player.rewardCoins)).toEqual([7, 0])
    expect(() => parseResult({ ...capped, myCoinDelta: 15 }, '101')).toThrow()
    expect(() => parseResult({ ...capped, settlementStatus: 'PENDING', myCoinDelta: null }, '101')).toThrow()
    expect(() => parseResult({ ...result, participants: result.participants.map(p => ({ ...p, rewardCoins: 10000 })) }, '101')).toThrow()
    expect(() => parseResult({ ...result, gameCode: 'OMOK' }, '101')).toThrow()
  })
  it('착지 없이 여러 층을 지나쳐도 머리 위 층이 시야를 가리지 않는다', () => {
    expect(visibleStoneFloor(2, 24)).toBe(2)
    expect(visibleStoneFloor(2, 25.3)).toBe(2)
    expect(visibleStoneFloor(2, 23)).toBe(1)
    expect(visibleStoneFloor(2, 11)).toBe(0)
    expect(visibleStoneFloor(2, -3)).toBe(0)
  })
  it('실제 엔진의 8명·683개 발판 응답을 참가자와 관전자가 읽는다', () => {
    const payload = { gameId: snapshot.gameId, version: 1, publicState: snapshot, privateState: {} }
    const player = parseGame({ ...payload, role: 'PLAYER' }, '808')
    const spectator = parseGame({ ...payload, role: 'SPECTATOR' }, '999')
    expect(gamePlayers(player)).toHaveLength(8)
    expect(player.stone?.tiles).toHaveLength(683)
    expect(STONE_TILE_COUNTS).toEqual([0, 1, 2].map(floor => snapshot.tiles.filter(tile => tile.floor === floor).length))
    expect(snapshot.players[0]!.x).toBe(-2 * STONE_TILE_SIZE)
    expect(player.stone?.players[0]?.slideReadyAt).toBe(snapshot.landsAt)
    expect([player.stone?.players[0]?.slideX, player.stone?.players[0]?.slideZ]).toEqual([0, 0])
    expect(() => parseStoneState({ ...snapshot, players: snapshot.players.map((p, i) => i ? p : { ...p, slideUntil: '300' }) })).toThrow()
    expect(() => parseStoneState({ ...snapshot, players: snapshot.players.map((p, i) => i ? p : { ...p, slideX: Infinity }) })).toThrow()
    expect(player.stone?.phase).toBe('DROPPING')
    expect(() => parseStoneState({ ...snapshot, landsAt: Infinity })).toThrow()
    expect(() => parseStoneState({ ...snapshot, phase: 'UNKNOWN' })).toThrow()
    expect(spectator.role).toBe('SPECTATOR')
    expect(() => parseStoneState({ ...snapshot, players: [...snapshot.players, { ...snapshot.players[0], userId: '909' }] })).toThrow()
  })

  it('8인 결과는 돌탑만 허용하고 기존 게임의 제한은 유지한다', () => {
    const payload = { gameSessionId: '7', version: 1, gameCode: 'STONE_RUMBLE', status: 'FINISHED',
      endReason: 'ALL_FALLEN', settlementStatus: 'PENDING', betAmountPerPlayer: 0, myCoinDelta: null,
      endedAt: '2026-11-06T00:00:00Z', participants: snapshot.players.map(p => ({ userId: p.userId, result: 'DRAW' })) }
    expect(parseResult(payload, '808').participants).toHaveLength(8)
    expect(() => parseResult({ ...payload, gameCode: 'DICE' }, '808')).toThrow()
  })

  it('8인 기권 연출도 돌탑의 정원 계약으로 검증한다', () => {
    const payload = { eventId: 'event', gameId: '7', tableId: 'arena', channelId: 'channel',
      gameCode: 'STONE_RUMBLE', version: 1, userId: '808', kind: 'FORFEIT', remainingBefore: 8,
      participantCount: 8, motion: 'head-clutch', durationMs: 3600, occurredAt: '2026-11-06T00:00:00Z' }
    expect(parseGameReaction(payload).remainingBefore).toBe(8)
    expect(() => parseGameReaction({ ...payload, gameCode: 'ONE_CARD' })).toThrow()
  })
})
