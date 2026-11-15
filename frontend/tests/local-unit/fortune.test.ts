import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drawFortune, drawFortuneDeck, FORTUNE_GAMES, FORTUNE_PENDING_GAMES, parseFortuneNickname } from '../../src/features/fortune/model'
import { beginFortuneConnection, chooseFortuneCard, closeFortune, finishFortuneGather, finishFortuneReveal, finishFortuneShuffle,
  startFortuneShuffle, useFortune } from '../../src/features/fortune/state'
import { canReachFortune, FORTUNE_SITE } from '../../src/features/fortune/placement'
import { TABLE_GAMES } from '../../src/features/tableLobby/model'
import { inputState } from '../../src/world/inputOwnership'
import { FORTUNE_COOLDOWN_MS, fortuneReceiptKey, fortuneWaitLabel, readFortuneReceipt } from '../../src/features/fortune/cooldown'

beforeEach(() => {
  vi.restoreAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T06:00:00Z'))
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => callback() } })
  beginFortuneConnection('new-user')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
async function pick(index = 0) {
  startFortuneShuffle(); finishFortuneShuffle(useFortune.getState().connection); await chooseFortuneCard(index)
  finishFortuneGather(useFortune.getState().connection)
  finishFortuneReveal(useFortune.getState().connection)
}
describe('광장 운세', () => {
  it('새 오락기 3종만 추첨에 넣고 진입 미연결 카드는 추첨과 저장 복원에서 제외한다', () => {
    for (const id of ['whack-a-mole', 'rps-roulette', 'plus-minus'])
      expect(FORTUNE_GAMES.find(game => game.id === id)?.destination).toBe('arcade')
    for (const pending of FORTUNE_PENDING_GAMES) {
      expect(FORTUNE_GAMES.some(game => game.id === pending.id)).toBe(false)
      localStorage.setItem(fortuneReceiptKey('new-user'), JSON.stringify({ version: 1, nickname: '미리보기', gameId: pending.id,
        selectedIndex: 0, issuedAt: Date.now(), nextAllowedAt: Date.now() + FORTUNE_COOLDOWN_MS }))
      expect(readFortuneReceipt('new-user')).toBeNull()
    }
  })
  it('공사 중인 게임은 추천하지 않고 실제 플레이 가능 목록을 따른다', () => {
    for (const game of FORTUNE_GAMES.filter(g => g.destination === 'table'))
      expect(TABLE_GAMES.find(g => g.code === game.id)?.playable).toBe(true)
    expect(FORTUNE_GAMES.some(g => g.id === 'LIAR_BRIDGE')).toBe(false)
  })
  it('한글 이름을 정규화하고 빈 이름·제어 문자·길이 초과를 거절한다', () => {
    expect(parseFortuneNickname('  산책자  ')).toBe('산책자')
    for (const value of ['', '   ', 'a\n나', '\u200b', '가'.repeat(21)]) expect(parseFortuneNickname(value)).toBeNull()
    expect(parseFortuneNickname('가'.repeat(20))).toHaveLength(20)
  })
  it('창을 닫고 다시 열거나 닉네임을 바꿔도 제한 시간의 카드를 유지한다', async () => {
    useFortune.setState({ open: true, draft: '산책자' }); await pick()
    const result = useFortune.getState().result
    expect(result).not.toBeNull(); closeFortune()
    expect(inputState.fortuneOpen).toBe(false)
    useFortune.setState({ open: true, draft: '다른 이름' }); await pick(2)
    expect(useFortune.getState().result).toBe(result)
    expect(useFortune.getState().nickname).toBe('산책자')
  })
  it('재접속해도 3시간 전에는 같은 운세를 복원하고 계정별로 분리한다', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    beginFortuneConnection('owner'); useFortune.setState({ open: true, draft: '별명' }); await pick()
    const previous = useFortune.getState().result!
    beginFortuneConnection('owner')
    expect(useFortune.getState()).toMatchObject({ open: false, draft: '별명', nickname: '별명', result: previous, phase: 'revealed' })
    useFortune.setState({ open: true, draft: '다른 별명' }); await pick(2)
    expect(useFortune.getState().result!.id).toBe(previous.id)
    beginFortuneConnection('another'); expect(useFortune.getState().previousId).toBe('')
  })
  it('추첨의 양 끝에서 유효한 게임을 고르고 이전 게임을 제외한다', () => {
    for (const game of FORTUNE_GAMES) {
      expect(drawFortune(game.id, () => 0).id).not.toBe(game.id)
      expect(drawFortune(game.id, () => .999999).id).not.toBe(game.id)
    }
  })
  it('세 카드에 서로 다른 게임을 배정하며 고른 카드가 실제 결과가 된다', async () => {
    useFortune.setState({ open: true, draft: '선택자' }); startFortuneShuffle()
    const state = useFortune.getState(), deck = state.deck
    expect(new Set(deck.map(card => card.id)).size).toBe(3)
    expect(state.result).toBeNull()
    await chooseFortuneCard(1); expect(useFortune.getState().result).toBeNull()
    finishFortuneShuffle(state.connection)
    await chooseFortuneCard(-1); expect(useFortune.getState().result).toBeNull()
    await Promise.all([chooseFortuneCard(1), chooseFortuneCard(2)])
    expect(useFortune.getState()).toMatchObject({ selectedIndex: 1, result: deck[1], phase: 'gathering' })
    closeFortune(); expect(useFortune.getState().phase).toBe('revealed')
  })
  it('열기와 셔플은 횟수를 쓰지 않고 선택 시각부터 정확히 3시간을 계산한다', async () => {
    const start = Date.now()
    useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    expect(localStorage.getItem(fortuneReceiptKey('new-user'))).toBeNull()
    vi.setSystemTime(start + 5000)
    finishFortuneShuffle(useFortune.getState().connection); await chooseFortuneCard(0)
    const { result, issuedAt, nextAllowedAt } = useFortune.getState()
    expect(issuedAt).toBe(start + 5000)
    expect(nextAllowedAt).toBe(issuedAt + FORTUNE_COOLDOWN_MS)
    vi.setSystemTime(nextAllowedAt - 1); beginFortuneConnection('new-user')
    expect(useFortune.getState().result).toEqual(result)
    vi.setSystemTime(nextAllowedAt); beginFortuneConnection('new-user')
    expect(useFortune.getState()).toMatchObject({ phase: 'writing', result: null, previousId: result!.id })
    useFortune.setState({ open: true, draft: '산책자' }); await pick()
    expect(useFortune.getState().result!.id).not.toBe(result!.id)
  })
  it('저장 실패 시 결과를 공개하지 않고 같은 선택을 다시 시도할 수 있다', async () => {
    useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    finishFortuneShuffle(useFortune.getState().connection)
    const save = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await chooseFortuneCard(0)
    expect(useFortune.getState()).toMatchObject({ result: null, phase: 'choosing', pending: false })
    expect(useFortune.getState().error).toContain('저장')
    save.mockRestore(); await chooseFortuneCard(0)
    expect(useFortune.getState().result).not.toBeNull()
  })
  it('남은 시간은 실제 밀리초로 계산하고 초 단위 올림으로 표시한다', () => {
    expect(fortuneWaitLabel(FORTUNE_COOLDOWN_MS)).toBe('03:00:00')
    expect(fortuneWaitLabel(1)).toBe('00:00:01')
    expect(fortuneWaitLabel(-1)).toBe('00:00:00')
  })
  it('셔플 중 닫아도 데크를 보존하고 재접속 이후 낡은 타이머는 무시한다', () => {
    useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    const { deck, connection } = useFortune.getState()
    closeFortune(); finishFortuneShuffle(connection)
    expect(useFortune.getState().phase).toBe('shuffling')
    useFortune.setState({ open: true }); startFortuneShuffle()
    expect(useFortune.getState().deck).toBe(deck)
    beginFortuneConnection('new-user'); useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    finishFortuneShuffle(connection); finishFortuneGather(connection); finishFortuneReveal(connection)
    expect(useFortune.getState().phase).toBe('shuffling')
    expect(useFortune.getState().result).toBeNull()
  })
  it('카드를 합친 뒤 선택한 한 장만 공개하며 순서가 다른 완료 이벤트를 무시한다', async () => {
    useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    const connection = useFortune.getState().connection
    finishFortuneShuffle(connection); await chooseFortuneCard(2)
    const result = useFortune.getState().result
    finishFortuneReveal(connection)
    expect(useFortune.getState().phase).toBe('gathering')
    finishFortuneGather(connection - 1)
    expect(useFortune.getState().phase).toBe('gathering')
    finishFortuneGather(connection)
    expect(useFortune.getState().phase).toBe('revealing')
    finishFortuneGather(connection); finishFortuneReveal(connection)
    expect(useFortune.getState()).toMatchObject({ phase: 'revealed', result, selectedIndex: 2 })
  })
  it('합치는 중 재접속해도 선택 결과를 복원하고 이전 연출 완료를 무시한다', async () => {
    useFortune.setState({ open: true, draft: '산책자' }); startFortuneShuffle()
    const connection = useFortune.getState().connection
    finishFortuneShuffle(connection); await chooseFortuneCard(1)
    const { result, nextAllowedAt } = useFortune.getState()
    beginFortuneConnection('new-user'); useFortune.setState({ open: true })
    finishFortuneGather(connection); finishFortuneReveal(connection)
    expect(useFortune.getState()).toMatchObject({ phase: 'revealed', result, nextAllowedAt })
  })
  it('새 데크는 이전 추천 게임을 제외한다', () => {
    for (const previous of FORTUNE_GAMES) {
      const deck = drawFortuneDeck(previous.id)
      expect(deck).toHaveLength(3)
      expect(deck.some(game => game.id === previous.id)).toBe(false)
    }
  })
  it('같은 높이의 광장 근처에서만 상호작용한다', () => {
    const near = { x: FORTUNE_SITE.x, y: FORTUNE_SITE.y + .8, z: FORTUNE_SITE.z + 2.5 }
    expect(canReachFortune(near)).toBe(true)
    expect(canReachFortune({ ...near, z: near.z + 10 })).toBe(false)
    expect(canReachFortune({ ...near, y: near.y + 5 })).toBe(false)
    expect(canReachFortune({ ...near, x: NaN })).toBe(false)
  })
})
