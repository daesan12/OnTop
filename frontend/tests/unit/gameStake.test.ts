import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import type { Game } from '../../src/game/protocol'
import { matchStake, matchStakeDetails, stakeLabel } from '../../src/game/stake'

// Server rendering reads the stores' initial snapshot, so the selectors read this state instead (as gameSpectatorCount.test.ts does).
const state = vi.hoisted(() => ({ game: null as Game | null, tableStates: {} as Record<string, { gameId: string | null; betAmountPerPlayer: number | null }>,
  tables: [] as { gameId: string | null; betAmountPerPlayer: number | null }[] }))
vi.mock('../../src/game/store', () => ({ useGame: (select: (s: typeof state) => unknown) => select(state) }))
vi.mock('../../src/network/worldClient', () => ({ useSession: (select: (s: typeof state) => unknown) => select(state) }))
vi.mock('../../src/game/GameTurnNotice', () => ({ GameTurnNotice: () => null }))
import { GameHudClock } from '../../src/game/GameHud'
import { GameSpectatorStake } from '../../src/game/GameSpectatorStake'
import { halliState } from '../fixtures/halligalli'
import { ledgerState } from '../fixtures/ledger'

const omok = (status: 'PLAYING' | 'FINISHED' = 'PLAYING', gameId = 'g-1') =>
  ({ gameId, version: 3, role: 'PLAYER', omok: { status, blackUserId: '101', whiteUserId: '102' } }) as unknown as Game
const table = (gameId: string | null, betAmountPerPlayer: number | null) => ({ t1: { gameId, betAmountPerPlayer } })
afterEach(() => { state.game = null; state.tableStates = {}; state.tables = [] })

it('총 판돈은 같은 경기 ID 테이블의 1인 판돈 × 원래 참가자 수다', () => {
  expect(matchStake(omok(), table('g-1', 200))).toBe(400)
  const ledger = { gameId: 'g-4', version: 1, role: 'PLAYER', ledger: ledgerState(4) } as unknown as Game
  expect(matchStake(ledger, { other: { gameId: 'g-9', betAmountPerPlayer: 5 }, mine: { gameId: 'g-4', betAmountPerPlayer: 150 } })).toBe(600)
})
it('기권·탈락한 참가자의 판돈도 총액에 남는다', () => {
  const ledger = ledgerState(4); ledger.players[2] = { ...ledger.players[2]!, forfeited: true }
  expect(matchStake({ gameId: 'g', version: 1, role: 'PLAYER', ledger } as unknown as Game, table('g', 100))).toBe(400)
  const halli = halliState(4) as Record<string, unknown> & { players: { active: boolean }[] }
  halli.players[1]!.active = false; halli.players[3]!.active = false
  expect(matchStake({ gameId: 'g', version: 1, role: 'PLAYER', halli } as unknown as Game, table('g', 100))).toBe(400)
  const dice = { gameId: 'g', version: 1, role: 'PLAYER', dice: { status: 'PLAYING', players: ['101', '102', '103'], forfeitedUserIds: ['102'] } } as unknown as Game
  expect(matchStake(dice, table('g', 100))).toBe(300)
})
it('참가자와 관전자는 같은 테이블 상태에서 같은 총액을 본다', () => {
  const spectator = { ...omok(), role: 'SPECTATOR' } as Game
  expect(matchStake(spectator, table('g-1', 250))).toBe(matchStake(omok(), table('g-1', 250)))
})
it('경기 ID가 다르거나 테이블 상태가 없거나 경기가 진행 중이 아니면 표시하지 않는다', () => {
  expect(matchStake(omok(), table('g-2', 200))).toBeNull()
  expect(matchStake(omok(), table(null, 200))).toBeNull()
  expect(matchStake(omok(), {})).toBeNull()
  expect(matchStake(omok('FINISHED'), table('g-1', 200))).toBeNull()
  expect(matchStake(null, table('g-1', 200))).toBeNull()
  expect(matchStake(omok('PLAYING', ''), table('', 200))).toBeNull()
})
it('판돈 0, 미설정, 비정상 숫자, 안전 정수 범위 초과는 표시하지 않는다', () => {
  for (const bet of [0, null, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
    expect(matchStake(omok(), table('g-1', bet))).toBeNull()
  expect(matchStake(omok(), table('g-1', Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1))).toBeNull()
  expect(matchStake(omok(), table('g-1', Math.floor(Number.MAX_SAFE_INTEGER / 2)))).toBe(Number.MAX_SAFE_INTEGER - 1)
})
it('금액은 천 단위 쉼표와 냥 단위로 표시한다', () => {
  expect(stakeLabel(400)).toBe('400냥')
  expect(stakeLabel(1_234_567)).toBe('1,234,567냥')
  expect(stakeLabel(4_000_000_000_000)).toBe('4,000,000,000,000냥')
})

it('상세 관전 상태가 오기 전에는 같은 경기 ID의 공개 테이블 판돈을 사용한다', () => {
  expect(matchStakeDetails(omok(), {}, [{ gameId: 'g-1', betAmountPerPlayer: 300 }]))
    .toEqual({ perPlayer: 300, participants: 2, total: 600 })
  expect(matchStakeDetails(omok(), table('old-game', 900), [{ gameId: 'g-1', betAmountPerPlayer: 300 }])?.total).toBe(600)
  expect(matchStakeDetails(omok(), table('g-1', 200), [{ gameId: 'g-1', betAmountPerPlayer: 300 }])?.total).toBe(400)
  expect(matchStakeDetails(omok(), table('g-1', null), [{ gameId: 'g-1', betAmountPerPlayer: 300 }])).toBeNull()
  expect(matchStakeDetails(omok(), {}, [{ gameId: 'old-game', betAmountPerPlayer: 300 }])).toBeNull()
})

const spectatorStake = () => renderToStaticMarkup(createElement(GameSpectatorStake))
it('내부 게임 상태가 비어 있는 관전 스냅샷은 숨기고 동기화 후 정상 표시한다', () => {
  state.game = { gameId: 'g-1', version: 1, role: 'SPECTATOR' } as unknown as Game
  state.tableStates = table('g-1', 250)
  expect(spectatorStake()).toBe('')
  state.game = { ...omok(), role: 'SPECTATOR' }
  expect(spectatorStake()).toContain('<strong>500냥</strong>')
})
it('관전자에게 총액과 1인 판돈·인원을 명확히 표시한다', () => {
  state.game = { ...omok(), role: 'SPECTATOR' }; state.tableStates = table('g-1', 250)
  expect(spectatorStake()).toContain('aria-label="관전 경기 판돈"')
  expect(spectatorStake()).toContain('<span>총 판돈</span><strong>500냥</strong>')
  expect(spectatorStake()).toContain('1인 250냥 × 2명')
})
it('확정된 무료 경기 0냥과 아직 확인되지 않은 판돈을 구분한다', () => {
  state.game = { ...omok(), role: 'SPECTATOR' }; state.tableStates = table('g-1', 0)
  expect(spectatorStake()).toContain('<strong>0냥</strong>')
  state.tableStates = table('other-game', 100)
  expect(spectatorStake()).toContain('<strong>확인 중</strong>')
  expect(spectatorStake()).not.toContain('0냥')
})
it('관전이 끝나거나 참가자 화면이면 관전자 판돈 카드를 남기지 않는다', () => {
  state.tableStates = table('g-1', 250)
  for (const game of [null, omok(), { ...omok('FINISHED'), role: 'SPECTATOR' } as Game]) {
    state.game = game; expect(spectatorStake()).toBe('')
  }
})

const clock = () => renderToStaticMarkup(createElement(GameHudClock, { game: '오목', label: '내 차례', remainingMs: 9000 }))
const setTable = (gameId: string | null, betAmountPerPlayer: number | null) => { state.tableStates = table(gameId, betAmountPerPlayer) }
it('진행 중 경기는 턴 카드의 게임 이름 바로 뒤에 같은 줄로 총 판돈을 붙인다', () => {
  state.game = omok(); setTable('g-1', 200)
  expect(clock()).toContain('</svg><span class="game-hud-title">오목<span class="game-hud-stake">\u00a0· 400냥</span></span></span>')
  expect(clock()).toContain('aria-label="오목 남은 시간"')
})
it('판돈이 없거나 경기가 끝나면 게임 이름만 기존 마크업 그대로 남긴다', () => {
  const plain = () => expect(clock()).toContain('</svg>오목</span>')
  plain()
  state.game = omok(); setTable('g-1', 0); plain()
  setTable('g-2', 200); plain()
  state.game = omok('FINISHED'); setTable('g-1', 200); plain()
  expect(clock()).not.toContain('game-hud-stake')
})
