import { describe, expect, it } from 'vitest'
import { parseRummikub, parseRummikubHand, physical, validMeld, type Placed, type Rummikub } from '../../src/game/rummikub/protocol'
import { parseGame } from '../../src/game/protocol'
import { gameSelection } from '../../src/features/tableLobby/model'
import { sortRummikubTiles, toggleRummikubTile, useRummikubDraft } from '../../src/game/rummikub/draft'

const tile = (color: string, number: number, copy = 0): Placed => ({ id: `${color}-${number}-${copy}`, color: color as Placed['color'], number })
const fresh = (): Rummikub => ({
  gameCode: 'RUMMIKUB', status: 'PLAYING', turnTimeLimitMs: 60000, turnUserId: '101', turnId: 1,
  turnDeadline: '2026-11-21T12:00:00Z', poolCount: 78, initialMeldPoints: 30, jokerPenalty: 30, melds: [],
  players: ['101', '202'].map(userId => ({ userId, tileCount: 14, registered: false, forfeited: false, score: null })),
  firstUserId: '101', openingDraws: [{ userId: '101', color: 'RED', number: 13 }, { userId: '202', color: 'BLUE', number: 1 }], finalTurnUserIds: [],
  winnerUserIds: [], endReason: null, endedAt: null, lastEvent: 'START',
})
const hand = () => ({ userId: '101', tiles: Array.from({ length: 14 }, (_, i) => physical(`RED-${Math.floor(i / 2) + 1}-${i % 2}`)!) })
describe('수패마루 계약', () => {
  it('3D 받침대와 조작 목록은 같은 정렬을 쓰고 원본 손패를 바꾸지 않는다', () => {
    const tiles = [physical('RED-12-0')!, physical('BLUE-3-0')!, physical('BLACK-10-0')!]
    expect(sortRummikubTiles(tiles, 'number').map(t=>t.number)).toEqual([3,10,12])
    expect(sortRummikubTiles(tiles, 'color').map(t=>t.color)).toEqual(['BLACK','BLUE','RED'])
    expect(tiles.map(t=>t.number)).toEqual([12,3,10])
  })
  it('공개 조커를 고르면 현재 대체 역할을 조작기에 유지한다', () => {
    useRummikubDraft.setState({draft:[[{id:'JOKER-0',color:'BLACK',number:10}]],selected:[],jokerColor:'RED',jokerNumber:1})
    toggleRummikubTile('JOKER-0')
    expect(useRummikubDraft.getState()).toMatchObject({selected:['JOKER-0'],jokerColor:'BLACK',jokerNumber:10})
    useRummikubDraft.setState({source:null,draft:null,selected:[],jokerColor:'RED',jokerNumber:1})
  })
  it('4색 고유 타일과 조커만 허용한다', () => {
    expect(physical('BLUE-13-1')).toEqual({ id: 'BLUE-13-1', color: 'BLUE', number: 13 })
    expect(physical('GREEN-1-0')).toBeNull()
    expect(physical('RED-01-0')).toBeNull()
    expect(physical('JOKER-2')).toBeNull()
  })
  it('중복 색 그룹과 13-1 순환을 거절한다', () => {
    expect(validMeld([tile('RED', 7), tile('BLUE', 7), tile('YELLOW', 7)])).toBe(true)
    expect(validMeld([tile('RED', 7), tile('RED', 7, 1), tile('BLUE', 7)])).toBe(false)
    expect(validMeld([tile('BLUE', 12), tile('BLUE', 13), tile('BLUE', 1)])).toBe(false)
  })
  it('공개 상태와 본인 손패를 파싱한다', () => {
    expect(parseRummikub(fresh()).poolCount).toBe(78)
    expect(parseRummikubHand(hand(), fresh(), '101', 'PLAYER')?.tiles).toHaveLength(14)
  })
  it('60초 제한과 선공 추첨의 최고값을 검사한다', () => {
    const state = fresh()
    expect(parseRummikub(state).firstUserId).toBe('101')
    expect(() => parseRummikub({ ...state, turnTimeLimitMs: 120000 })).toThrow()
    expect(() => parseRummikub({ ...state, firstUserId: '202' })).toThrow()
    state.openingDraws[1] = { userId: '202', color: null, number: 0 }
    state.firstUserId = '202'
    expect(parseRummikub(state).firstUserId).toBe('202')
  })
  it('더미 소진 뒤 남은 마지막 차례와 참가자만 허용한다', () => {
    const state = fresh()
    state.players[0]!.tileCount += state.poolCount; state.poolCount = 0
    state.finalTurnUserIds = ['101', '202']
    expect(parseRummikub(state).finalTurnUserIds).toHaveLength(2)
    expect(() => parseRummikub({ ...state, finalTurnUserIds: ['101', '101'] })).toThrow()
    expect(() => parseRummikub({ ...state, finalTurnUserIds: ['999'] })).toThrow()
  })
  it('관전자 손패 노출과 다른 사람의 손패를 거절한다', () => {
    expect(parseRummikubHand({}, fresh(), '', 'SPECTATOR')).toBeNull()
    expect(() => parseRummikubHand(hand(), fresh(), '', 'SPECTATOR')).toThrow()
    expect(() => parseRummikubHand(hand(), fresh(), '202', 'PLAYER')).toThrow()
  })
  it('실물과 다른 숫자와 중복 손패를 거절한다', () => {
    const bad = hand(); bad.tiles[0] = { id: 'RED-1-0', color: 'BLUE', number: 1 }
    expect(() => parseRummikubHand(bad, fresh(), '101', 'PLAYER')).toThrow()
    const duplicate = hand(); duplicate.tiles[1] = duplicate.tiles[0]!
    expect(() => parseRummikubHand(duplicate, fresh(), '101', 'PLAYER')).toThrow()
  })
  it('타일 보존과 유효 조합을 공개 계약에서도 검사한다', () => {
    const p = fresh(); p.poolCount--
    expect(() => parseRummikub(p)).toThrow()
    p.poolCount = 75; p.melds = [[tile('RED', 4), tile('RED', 5), tile('RED', 6)]]
    expect(parseRummikub(p).melds).toHaveLength(1)
    p.melds[0]![1] = tile('BLUE', 5)
    expect(() => parseRummikub(p)).toThrow()
  })
  it('공통 파서와 테이블 선택을 연결한다', () => {
    const game = parseGame({ gameId: 'g', version: 0, role: 'PLAYER', publicState: fresh(), privateState: hand() }, '101')
    expect(game.rummikub?.gameCode).toBe('RUMMIKUB')
    expect(gameSelection('RUMMIKUB', 0)).toEqual({ gameCode: 'RUMMIKUB', betAmountPerPlayer: 0 })
  })
})
