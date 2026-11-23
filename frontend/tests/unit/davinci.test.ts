import { describe, expect, it } from 'vitest'
import { parseGame, gamePlayers, gameState } from '../../src/game/protocol'
import { parseDavinci, parseDavinciHand, tileText, type DavinciState } from '../../src/game/davinci/protocol'
import { acceptDavinciPing, useDavinciPing } from '../../src/game/davinci/social'
import { openingActive, openingPose } from '../../src/game/davinci/presentation'
import { worldState } from '../../src/network/protocol'
import { receiveGame, resetGame, useGame } from '../../src/game/store'

const tile = (id: string) => ({ id, color: 'BLACK' as const, value: null, revealed: false })
function state(): DavinciState {
  return { gameCode: 'DAVINCI_CODE', status: 'PLAYING', stage: 'GUESS', version: 3, turnUserId: '101',
    turnDeadline: '2026-11-21T12:00:00Z', endedAt: null, endReason: null, winnerUserIds: [], lastEvent: null,
    players: ['101', '202'].map((userId, seat) => ({ userId, seat, active: true, forfeited: false, ready: true, tileCount: 1, tiles: [tile('tile-' + userId)] })),
    supply: [{ id: 'supply-1', color: 'WHITE' }] }
}
function hand() { return { userId: '101', tiles: [{ ...tile('tile-101'), value: 6 }], validPositions: [], unplacedJokerIds: [], pendingTile: null } }

describe('흑백수사 공개·개인 계약', () => {
  it('공개 버전이 같은 본인 상태 재조회로도 위치 예약을 갱신한다', () => {
    resetGame()
    try {
      const s = { ...state(), stage: 'PLACE_TILE' as const, placementDeadline: '2026-11-21T12:00:10Z' }
      const h = { ...hand(), pendingTile: { id: 'drawn', color: 'WHITE' as const, value: -1, revealed: false },
        validPositions: [0, 1], selectedPosition: null as number | null }
      useGame.setState({ permittedGameId: 'game', recovery: 'RESTORED' })
      const send = () => receiveGame({ type: 'GAME_STATE', requestId: 'check', payload: {
        gameId: 'game', version: s.version, role: 'PLAYER', publicState: s, privateState: h,
      } }, '101', 'table')
      send()
      h.selectedPosition = 1
      send()
      expect(useGame.getState().game?.version).toBe(3)
      expect(useGame.getState().game?.davinciHand?.selectedPosition).toBe(1)
    } finally { resetGame() }
  })
  it('배치 마감만 공개하고 예약 위치는 해당 사용자의 개인 상태에서만 읽는다', () => {
    const s = { ...state(), stage: 'PLACE_TILE' as const, placementDeadline: '2026-11-21T12:00:10Z' }
    const pending = { id: 'drawn', color: 'WHITE' as const, value: -1, revealed: false }
    const own = { ...hand(), pendingTile: pending, validPositions: [0, 1], selectedPosition: 1 }
    expect(parseDavinci(s).placementDeadline).toBe(s.placementDeadline)
    expect(parseDavinciHand(own, s, '101', 'PLAYER')?.selectedPosition).toBe(1)
    expect(() => parseDavinci({ ...s, selectedPosition: 1 })).toThrow()
    expect(() => parseDavinci({ ...s, pendingTile: pending })).toThrow()
    expect(() => parseDavinci({ ...s, validPositions: [0, 1] })).toThrow()
    expect(() => parseDavinci({ ...s, placementDeadline: 'bad' })).toThrow()
    expect(() => parseDavinci({ ...s, stage: 'GUESS' })).toThrow()
    expect(() => parseDavinciHand({ ...own, selectedPosition: 2 }, s, '101', 'PLAYER')).toThrow()
    expect(() => parseDavinciHand({ ...own, pendingTile: null }, s, '101', 'PLAYER')).toThrow()
    expect(() => parseDavinciHand(own, s, '202', 'PLAYER')).toThrow()
    expect(() => parseDavinciHand(own, s, '999', 'SPECTATOR')).toThrow()
    expect(parseDavinciHand({}, s, '999', 'SPECTATOR')).toBeNull()
  })
  it('서버 시각에 맞춰 섞기를 시작하고 재접속 시 완료된 연출을 반복하지 않는다', () => {
    const s = { ...state(), stage: 'SETUP' as const, openingStartedAt: '2026-11-21T12:00:00Z' }
    expect(openingActive(s, Date.parse(s.openingStartedAt) + 1200)).toBe(true)
    expect(openingActive(s, Date.parse(s.openingStartedAt) + 4200)).toBe(false)
    expect(openingPose(3, 800)).not.toEqual(openingPose(3, 1600))
    expect(() => parseDavinci({ ...state(), openingStartedAt: 'invalid' })).toThrow()
  })
  it('주변 공원 투영에서도 비공개 숫자와 개인 상태를 거절한다', () => {
    const publicState = { channelId: 'one', version: 1, avatars: [], mapVersion: 'map', tables: [{
      tableId: 'table', anchorId: 'anchor', chairCount: 4, gameCode: 'DAVINCI_CODE', secretTiles: { gameId: 'game', state: state() },
    }] }
    expect(worldState(publicState).tables?.[0]?.secretTiles?.state.players).toHaveLength(2)
    publicState.tables[0]!.secretTiles.state.players[1]!.tiles[0]!.value = 7
    expect(() => worldState(publicState)).toThrow()
    const unsafe = { ...publicState, tables: [{ ...publicState.tables[0], secretTiles: { gameId: 'game', state: state(), privateState: hand() } }] }
    expect(() => worldState(unsafe)).toThrow()
  })
  it('공통 경기 파서와 참가자·현재 상태 조회에 연결한다', () => {
    const game = parseGame({ gameId: 'game', version: 3, role: 'PLAYER', publicState: state(), privateState: hand() }, '101')
    expect(gamePlayers(game)).toEqual(['101', '202'])
    expect(gameState(game).gameCode).toBe('DAVINCI_CODE')
    expect(game.davinciHand?.tiles[0]?.value).toBe(6)
  })
  it('비공개 타일에 숫자가 실리면 거절한다', () => {
    const s = state(); s.players[1]!.tiles[0]!.value = 8
    expect(() => parseDavinci(s)).toThrow()
  })
  it('관전자의 개인 상태는 빈 객체만 허용한다', () => {
    expect(parseDavinciHand({}, state(), '999', 'SPECTATOR')).toBeNull()
    expect(() => parseDavinciHand(hand(), state(), '999', 'SPECTATOR')).toThrow()
    expect(() => parseGame({ gameId: 'game', version: 3, role: 'SPECTATOR', publicState: state(), privateState: hand() }, '999')).toThrow()
  })
  it('다른 사용자의 손패와 공개 배열에 없는 타일을 거절한다', () => {
    expect(() => parseDavinciHand(hand(), state(), '202', 'PLAYER')).toThrow()
    const h = hand(); h.tiles[0]!.id = 'unlisted'
    expect(() => parseDavinciHand(h, state(), '101', 'PLAYER')).toThrow()
  })
  it('공급 더미에는 숫자와 중복 식별자가 없어야 한다', () => {
    expect(() => parseDavinci({ ...state(), supply: [{ id: 'pool', color: 'WHITE', value: 4 }] })).toThrow()
    expect(() => parseDavinci({ ...state(), supply: [{ id: 'tile-101', color: 'WHITE' }] })).toThrow()
  })
  it('공개된 타일의 숫자는 본인의 개인 상태와 같아야 한다', () => {
    const s = state(); s.players[0]!.tiles[0] = { ...tile('tile-101'), value: 7, revealed: true }
    const h = hand(); h.tiles[0]!.revealed = true
    expect(() => parseDavinciHand(h, s, '101', 'PLAYER')).toThrow()
  })
  it('조커와 비공개 상태를 구분해 표시한다', () => {
    expect(tileText(-1)).toBe('조커'); expect(tileText(null)).toBe('비공개'); expect(tileText(0)).toBe('0')
  })
  it('옛 판이나 다른 경기의 추천 핑은 화면에 남기지 않는다', () => {
    useDavinciPing.setState({ ping: null })
    const message = { type: 'DAVINCI_SPECTATOR_PING', requestId: null, payload: { gameId: 'game', eventId: 'ping',
      targetUserId: '202', tileId: 'tile-202', senderUserId: '999', basedOnVersion: 3, sentAt: 100, serverNow: 100, expiresAt: 2100 } }
    acceptDavinciPing(message, 'other-game', state())
    expect(useDavinciPing.getState().ping).toBeNull()
    acceptDavinciPing(message, 'game', state())
    expect(useDavinciPing.getState().ping?.tileId).toBe('tile-202')
    useDavinciPing.setState({ ping: null })
    acceptDavinciPing(message, 'game', { ...state(), version: 4 })
    expect(useDavinciPing.getState().ping).toBeNull()
  })
})
