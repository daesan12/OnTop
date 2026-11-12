import { create } from 'zustand'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { drawFortuneDeck, FORTUNE_GAMES, parseFortuneNickname, type FortuneGame } from './model'
import { FORTUNE_COOLDOWN_MS, readFortuneReceipt, saveFortuneReceipt, type FortuneReceipt } from './cooldown'

type FortunePhase = 'writing' | 'shuffling' | 'choosing' | 'gathering' | 'revealing' | 'revealed'
export { FORTUNE_SHUFFLE_MS, FORTUNE_GATHER_MS, FORTUNE_REVEAL_MS } from './timing'

export const useFortune = create(() => ({
  open: false, owner: '', connection: 0, nickname: '', draft: '', error: '',
  phase: 'writing' as FortunePhase, deck: [] as FortuneGame[], selectedIndex: null as number | null,
  result: null as FortuneGame | null, previousId: '',
  issuedAt: 0, nextAllowedAt: 0, pending: false,
}))

const storageError = '3시간 이용 제한을 저장하지 못했어요. 브라우저 저장 공간을 허용한 뒤 다시 시도해주세요.'
function restore(receipt: FortuneReceipt) {
  useFortune.setState({ phase: 'revealed', deck: [], result: FORTUNE_GAMES.find(game => game.id === receipt.gameId)!,
    selectedIndex: receipt.selectedIndex, nickname: receipt.nickname, draft: receipt.nickname,
    issuedAt: receipt.issuedAt, nextAllowedAt: receipt.nextAllowedAt, pending: false, error: '' })
}
/** Restores a real-time cooldown across socket reconnects, reloads and channel changes. */
export function beginFortuneConnection(owner: string) {
  const state = useFortune.getState()
  inputState.fortuneOpen = false
  useFortune.setState({ open: false, owner, connection: state.connection + 1, nickname: '', draft: '', error: '',
    phase: 'writing', deck: [], selectedIndex: null, issuedAt: 0, nextAllowedAt: 0, pending: false,
    result: null, previousId: owner === state.owner ? state.result?.id ?? state.previousId : '' })
  try {
    const receipt = readFortuneReceipt(owner)
    if (!receipt) return
    useFortune.setState({ previousId: receipt.gameId })
    if (Date.now() < receipt.nextAllowedAt) restore(receipt)
  } catch { useFortune.setState({ error: storageError }) }
}
export function syncFortuneCooldown() {
  const state = useFortune.getState()
  try {
    const receipt = readFortuneReceipt(state.owner)
    if (receipt && Date.now() < receipt.nextAllowedAt && receipt.issuedAt !== state.issuedAt) restore(receipt)
  } catch { useFortune.setState({ error: storageError }) }
}
export function startNewFortune() {
  const state = useFortune.getState()
  if (!state.open || state.pending || Date.now() < state.nextAllowedAt) return
  syncFortuneCooldown()
  const current = useFortune.getState()
  if (Date.now() < current.nextAllowedAt) return
  useFortune.setState({ phase: 'writing', deck: [], selectedIndex: null, result: null,
    previousId: current.result?.id ?? current.previousId, nickname: '', draft: '', issuedAt: 0, nextAllowedAt: 0, error: '' })
}
export function closeFortune() {
  inputState.fortuneOpen = false
  useFortune.setState(s => ({ open: false, error: '', phase: s.phase === 'gathering' || s.phase === 'revealing' ? 'revealed' : s.phase }))
  clearRoamingInput()
}
export function startFortuneShuffle() {
  syncFortuneCooldown()
  const state = useFortune.getState()
  if (!state.open || state.phase !== 'writing' || state.result || state.deck.length || state.pending) return
  if (Date.now() < state.nextAllowedAt) return
  const nickname = parseFortuneNickname(state.draft)
  if (!nickname) { useFortune.setState({ error: '닉네임을 1~20자로 입력해주세요. 빈 이름이나 제어 문자는 사용할 수 없어요.' }); return }
  useFortune.setState({ nickname, deck: drawFortuneDeck(state.previousId), phase: 'shuffling', error: '' })
}
export function finishFortuneShuffle(connection: number) {
  const state = useFortune.getState()
  if (state.open && state.connection === connection && state.phase === 'shuffling') useFortune.setState({ phase: 'choosing' })
}
export async function chooseFortuneCard(index: number) {
  const state = useFortune.getState()
  if (!state.open || state.phase !== 'choosing' || state.result || state.pending || !Number.isInteger(index) || !state.deck[index]) return
  useFortune.setState({ pending: true, error: '' })
  const commit = () => {
    const current = useFortune.getState()
    if (!current.open || current.owner !== state.owner || current.connection !== state.connection) return
    const previous = readFortuneReceipt(state.owner), now = Date.now()
    if (previous && now < previous.nextAllowedAt) { restore(previous); return }
    const result = state.deck[index]!, receipt: FortuneReceipt = { version: 1, nickname: state.nickname, gameId: result.id,
      selectedIndex: index, issuedAt: now, nextAllowedAt: now + FORTUNE_COOLDOWN_MS }
    saveFortuneReceipt(state.owner, receipt)
    useFortune.setState({ selectedIndex: index, result, phase: 'gathering', issuedAt: now, nextAllowedAt: receipt.nextAllowedAt })
  }
  try {
    // Same-origin tabs serialize the check and write on browsers supporting Web Locks.
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`fortune:${state.owner}`, commit)
    else commit()
  } catch { if (useFortune.getState().connection === state.connection) useFortune.setState({ error: storageError }) }
  finally { if (useFortune.getState().connection === state.connection) useFortune.setState({ pending: false }) }
}
export function finishFortuneGather(connection: number) {
  const state = useFortune.getState()
  if (state.open && state.connection === connection && state.phase === 'gathering') useFortune.setState({ phase: 'revealing' })
}
export function finishFortuneReveal(connection: number) {
  const state = useFortune.getState()
  if (state.open && state.connection === connection && state.phase === 'revealing') useFortune.setState({ phase: 'revealed' })
}
