import { beforeEach, describe, expect, it } from 'vitest'
import { parseChess } from '../../src/game/chess/protocol'
import { parseGame, gamePlayers } from '../../src/game/protocol'
import { canActChess } from '../../src/game/chess/actions'
import { receiveGame, useGame } from '../../src/game/store'
import { parseHistory } from '../../src/features/gameHistory/service'
import { useForfeit } from '../../src/game/forfeit'
import { gameSelection } from '../../src/features/tableLobby/model'

const fixture = () => ({ gameCode: 'CHESS', status: 'PLAYING',
  board: 'RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  whiteUserId: '101', blackUserId: '202', turnUserId: '101', turnDeadline: '2026-11-21T00:10:00Z',
  turnStartedAt: '2026-11-21T00:00:00Z', remainingMs: [600000, 600000], inCheck: false, canClaimDraw: false,
  legalMoves: [{ from: 'e2', to: 'e4', promotion: null }], moves: [], moveCount: 0,
  winnerUserId: null, endReason: null, endedAt: null, drawOfferedBy: null, drawOffersUsed: [],
})
const game = (role = 'PLAYER', privateState = {}) => parseGame({gameId: 'chess', version: 0, role, publicState: fixture(), privateState}, '101')

beforeEach(() => {
  useForfeit.setState({ attempt: null })
  useGame.setState({ game: game(), permittedGameId: 'chess', watchedGameId: '', recovery: 'RESTORED',
    pending: false, uncertain: false, awaitingVersion: 0, start: null })
})
describe('체스 공개 계약과 서버 권한', () => {
  it('기존 테이블에서 2인 체스를 선택하고 같은 gameCode로 파싱한다', () => {
    expect(gameSelection('CHESS', 0)).toEqual({gameCode:'CHESS', betAmountPerPlayer:0})
    expect(gamePlayers(game())).toEqual(['101','202'])
    expect(game('SPECTATOR').chess?.legalMoves).toHaveLength(1)
  })
  it('잘못된 좌표와 왕이 없는 상태를 거절한다', () => {
    expect(() => parseChess({...fixture(), legalMoves:[{from:'i2',to:'e4',promotion:null}]})).toThrow()
    expect(() => parseChess({...fixture(),board:'.'.repeat(64)})).toThrow()
  })
  it('관전자나 참가자에게 임의 개인 상태를 허용하지 않는다', () => {
    expect(() => game('SPECTATOR', {secret:'bad'})).toThrow()
    expect(() => game('PLAYER', {secret:'bad'})).toThrow()
  })
  it('서버가 허용한 본인 수만 전송한다', () => {
    expect(canActChess('101',{kind:'move',from:'e2',to:'e4'})).toBe(true)
    expect(canActChess('202',{kind:'move',from:'e2',to:'e4'})).toBe(false)
    expect(canActChess('101',{kind:'move',from:'e2',to:'e5'})).toBe(false)
  })
  it('대기 응답불명 낡은상태 관전에서는 행동하지 않는다', () => {
    for (const patch of [{pending:true},{uncertain:true},{awaitingVersion:1},{recovery:'UNKNOWN' as const},{game:game('SPECTATOR')}]) {
      const old = useGame.getState()
      useGame.setState(patch)
      expect(canActChess('101',{kind:'move',from:'e2',to:'e4'})).toBe(false)
      useGame.setState(old)
    }
  })
  it('무승부 제안은 상대만 수락하고 반복 청구는 자기 차례에만 보낸다', () => {
    const g=game(); g.chess!.drawOfferedBy='101';g.chess!.canClaimDraw=true
    useGame.setState({game:g})
    expect(canActChess('101',{kind:'drawRespond',accept:true})).toBe(false)
    expect(canActChess('202',{kind:'drawRespond',accept:true})).toBe(true)
    expect(canActChess('101',{kind:'claimDraw'})).toBe(true)
    expect(canActChess('202',{kind:'claimDraw'})).toBe(false)
  })
  it('종료 상태는 턴과 합법수가 남으면 거절한다', () => {
    expect(() => parseChess({...fixture(),status:'FINISHED',endedAt:'2026-11-21T00:01:00Z',endReason:'CHECKMATE'})).toThrow()
  })
  it('공통 수신 저장소가 체스 경기를 실제 게임 상태로 받아들인다', () => {
    receiveGame({type:'GAME_STATE',requestId:null,payload:{gameId:'chess',version:1,role:'PLAYER',
      publicState:fixture(),privateState:{}}}, '101', 'table')
    expect(useGame.getState().game?.chess?.gameCode).toBe('CHESS')
    expect(useGame.getState().game?.version).toBe(1)
    expect(useGame.getState().uncertain).toBe(false)
  })
  it('서버 체스 복구 스냅샷으로 같은 기보와 차례를 복원한다', () => {
    receiveGame({type:'GAME_CONNECTION_STATE',requestId:null,payload:{status:'RESTORED',gameId:'chess',version:2,
      state:{...fixture(),privateState:{}}}}, '101', 'table')
    expect(useGame.getState().game?.chess?.turnUserId).toBe('101')
    expect(useGame.getState().game?.version).toBe(2)
    expect(useGame.getState().recovery).toBe('RESTORED')
  })
  it('기존 전적 응답에서 체스 결과를 표시한다', () => {
    expect(parseHistory({items:[{gameSessionId:'188',gameCode:'CHESS',status:'FINISHED',myResult:'WIN',
      settlementStatus:'SETTLED',endedAt:'2026-11-21T00:01:00Z'}],nextCursor:null,hasNext:false}).items[0].gameCode).toBe('CHESS')
  })
})
