import { create } from 'zustand'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { unlockDiceSound } from '../farkle/sound'
import { canActLedger } from './actions'
import type { LedgerCategory, LedgerInput } from './protocol'

export const LEDGER_ROLL_MS = 900
const initial = () => ({ scope: '', keepIds: [] as number[], animationAt: 0, animationUntil: 0 })
/** Local keep selection only; the server decides held dice when a roll is accepted. */
export const useLedgerUI = create(initial)

export function ledgerScope() {
  const g = useGame.getState().game
  return g?.ledger ? `${g.gameId}/${g.ledger.turnId}/${g.ledger.rollId}` : ''
}
export function syncLedgerUI(animate = false) {
  const scope = ledgerScope()
  if (useLedgerUI.getState().scope === scope) return
  const g = useGame.getState().game, now = typeof performance !== 'undefined' ? performance.now() : 0
  // 직전 굴림에서 보관한 주사위를 다음 굴림에도 그대로 보관한다. 다시 눌러 해제할 수 있다.
  useLedgerUI.setState({ scope, keepIds: g?.ledger?.dice.filter(d => d.held).map(d => d.id) ?? [],
    animationAt: animate ? now : 0, animationUntil: animate ? now + LEDGER_ROLL_MS : 0 })
}
export function keptDice() {
  const ui = useLedgerUI.getState()
  return ui.scope === ledgerScope() ? ui.keepIds : []
}
export function ledgerAnimating(now = performance.now()) { return now < useLedgerUI.getState().animationUntil }

function ownTurnReady() {
  return useSession.getState().status === 'connected' && !Object.values(inputState).some(Boolean) && !ledgerAnimating()
}
export function rollLedger() {
  const own = useSession.getState().sessionId, input: LedgerInput = { kind: 'roll', keepIds: [...keptDice()].sort((a, b) => a - b) }
  if (!ownTurnReady() || !canActLedger(own, input)) return false
  unlockDiceSound()
  void parkRuntime.actLedger(input); return true
}
export function scoreLedger(category: LedgerCategory) {
  const own = useSession.getState().sessionId, input: LedgerInput = { kind: 'score', category }
  if (!ownTurnReady() || !canActLedger(own, input)) return false
  void parkRuntime.actLedger(input); return true
}
export function toggleKeep(id: number) {
  const g = useGame.getState().game, own = useSession.getState().sessionId
  // 굴린 뒤 남은 굴림이 있을 때만 보관을 바꾼다. 마지막 굴림 뒤에는 칸 기록만 남는다.
  if (!g?.ledger?.dice.length || !ownTurnReady() || !canActLedger(own, { kind: 'roll', keepIds: [] })) return
  syncLedgerUI()
  const ids = keptDice()
  useLedgerUI.setState({ keepIds: ids.includes(id) ? ids.filter(n => n !== id) : [...ids, id] })
}

/** Shared by players and spectators: replays the pour when a new roll arrives. */
export function installLedgerPresentation() {
  syncLedgerUI()
  const unsub = useGame.subscribe((s, old) => {
    const next = s.game?.ledger, prev = old.game?.ledger
    if (!next) { useLedgerUI.setState(initial(), true); return }
    syncLedgerUI(!!prev && s.game!.gameId === old.game?.gameId && next.rollId > prev.rollId && next.dice.length > 0)
  })
  return () => { unsub(); useLedgerUI.setState(initial(), true) }
}
export function installLedgerControls() {
  const down = (e: KeyboardEvent) => {
    if (!useGame.getState().game?.ledger || inputState.manualOpen || e.repeat || e.isComposing || e.ctrlKey || e.altKey
      || e.metaKey || document.hidden
      || (e.target instanceof HTMLElement && !!e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],.game-hud-menu'))) return
    if (e.code === 'KeyR') { e.preventDefault(); rollLedger() }
    const digit = /^Digit([1-5])$/.exec(e.code)
    if (digit) { e.preventDefault(); toggleKeep(Number(digit[1]) - 1) }
  }
  window.addEventListener('keydown', down, true)
  return () => window.removeEventListener('keydown', down, true)
}
