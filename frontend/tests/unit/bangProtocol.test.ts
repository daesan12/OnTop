import { describe, expect, it } from 'vitest'
import { CHARACTERS, parseBang, parseBangHand, type BangState } from '../../src/game/bang/protocol'
import { gamePlayers, gameState, parseGame, parseResult } from '../../src/game/protocol'
import { approvedChairCount } from '../../src/features/tableLobby/tabletModel'
import { turnOwner } from '../../src/audio/sfxEvents'

const state = (count = 7): BangState => ({
  gameCode: 'BANG', status: 'PLAYING', phase: 'PLAY', turnUserId: '2', actorUserId: '2',
  turnDeadline: '2026-11-21T01:00:00Z', turnNumber: 1, deckCount: 50, topDiscard: null, store: [], lastJudgement: null,
  judgementReason: null, endReason: null, endedAt: null, winnerUserIds: [], history: [],
  players: Array.from({ length: count }, (_, index) => ({ userId: String(index + 1), role: index === 1 ? 'SHERIFF' : null,
    character: CHARACTERS[index]!, hp: index === 1 ? 5 : 3, maxHp: index === 1 ? 5 : 3, active: true, forfeited: false,
    cardCount: index === 0 ? 1 : 4, range: 1, equipment: [] })),
})
const hand = () => ({ userId: '1', role: 'RENEGADE', hand: [{ id: 'b1', kind: 'BANG', suit: 'DIAMONDS', rank: 2 }], choices: [], actions: [],
  distances: { '1': 0, '2': 1, '3': 2, '4': 3, '5': 3, '6': 2, '7': 1 } })

describe('BANG 공개/개인 및 기존 테이블 계약', () => {
  it.each([4, 5, 6, 7])('%i인 공개 상태와 참여자 목록을 파싱한다', count => {
    const game = parseGame({ gameId: 'g1', version: 0, role: 'PLAYER', publicState: state(count), privateState: hand() }, '1')
    expect(gamePlayers(game)).toHaveLength(count)
    expect(gameState(game).gameCode).toBe('BANG')
    expect(game.bangHand?.role).toBe('RENEGADE')
    expect(turnOwner(game)).toBe('2')
  })
  it('관전자에게 빈 개인 상태만 허용한다', () => {
    const publicState = state()
    expect(parseBangHand({}, publicState, '99', 'SPECTATOR')).toBeNull()
    expect(() => parseBangHand(hand(), publicState, '99', 'SPECTATOR')).toThrow()
    expect(parseGame({ gameId: 'g1', version: 0, role: 'SPECTATOR', publicState, privateState: {} }, '99').bangHand).toBeNull()
  })
  it('다른 사람의 역할이 노출된 상태와 잘못된 손패 소유자를 거부한다', () => {
    const leaked = state()
    leaked.players[2]!.role = 'OUTLAW'
    expect(() => parseBang(leaked)).toThrow()
    expect(() => parseBangHand({ ...hand(), userId: '2' }, state(), '1', 'PLAYER')).toThrow()
  })
  it('빈사 상태의 음수 체력과 회복 선택을 보존한다', () => {
    const dying = state()
    dying.phase = 'RESCUE'; dying.actorUserId = '1'; dying.players[0]!.hp = -2
    expect(parseBang(dying).players[0]!.hp).toBe(-2)
  })
  it('일곱 명 공동 팀 결과를 기존 결과 파서가 수용한다', () => {
    const result = parseResult({ gameSessionId: 'g1', version: 8, gameCode: 'BANG', status: 'FINISHED', endReason: 'LAW_WINS', settlementStatus: 'SETTLED',
      betAmountPerPlayer: 10, participants: state().players.map((player, index) => ({ userId: player.userId, result: index < 3 ? 'WIN' : 'LOSE' })),
      myCoinDelta: 10, endedAt: '2026-11-21T01:00:00Z' }, '1')
    expect(result.participants).toHaveLength(7)
  })
  it('서버가 승인한 7석은 숨기지 않는다', () => {
    const table = { tableId: 't1', version: 1, capacity: 7, minimumPlayers: 4, gameCode: 'BANG', allReady: false, selectorUserId: '1',
      seats: state().players.map((player, index) => ({ seatNumber: index + 1, userId: player.userId, ready: false })), targetScore: null, betAmountPerPlayer: 0 }
    expect(approvedChairCount(table, 7)).toBe(7)
  })
})
