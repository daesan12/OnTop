import { create } from 'zustand'
import { useGame, canPlayDice } from '../store'
import { useSession } from '../../network/worldClient'
import { inputState, clearRoamingInput } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { eligibleDice, validDiceAction } from './scoring'

const initial = () => ({ scope: '', selectedIds: [] as number[], cup: 'idle' as 'idle' | 'holding' | 'ready', scoreOpen: false,
  animationAt: 0, animationUntil: 0, boardView: false })
export const useDiceUI = create(initial)
export const diceCamera = { ready: false }
export const cupMotion = { x: 0.91, z: 0.4, lift: 0, cancel: () => {} }
export const diceScope = () => {
  const g = useGame.getState().game, s = useSession.getState()
  return g?.dice ? `${s.sessionId}/${s.roomId}/${g.gameId}/${g.version}` : ''
}
export function resetDiceUI() {
  diceCamera.ready = false
  cupMotion.cancel(); cupMotion.x = 0.91; cupMotion.z = 0.4; cupMotion.lift = 0
  inputState.minigameOpen = false
  useDiceUI.setState(initial(), true)
}
export function cancelCup() { cupMotion.cancel(); cupMotion.lift = 0; useDiceUI.setState({ cup: 'idle' }) }
export function syncDiceUI(animate = false) {
  if (useDiceUI.getState().scope === diceScope()) return
  cancelCup()
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  useDiceUI.setState({ scope: diceScope(), selectedIds: [], animationAt: animate ? now : 0, animationUntil: animate ? now + 900 : 0 })
}
export function diceCanAct() {
  const s = useSession.getState(), ui = useDiceUI.getState()
  return s.status === 'connected' && !s.pending && canPlayDice(s.sessionId)
    && !Object.values(inputState).some(Boolean) && !ui.scoreOpen && performance.now() >= ui.animationUntil
}
export function selectedDice() { return useDiceUI.getState().scope === diceScope() ? useDiceUI.getState().selectedIds : [] }
export function canRollDice() {
  const g = useGame.getState().game
  return diceCanAct() && !!g?.dice && validDiceAction(g.dice, 'roll', selectedDice())
}
export function rollDice() {
  if (!canRollDice() || useDiceUI.getState().cup !== 'idle') return false
  void parkRuntime.actDice('roll', [...selectedDice()]); return true
}
export function bankDice() {
  const g = useGame.getState().game
  if (!diceCanAct() || !g?.dice || useDiceUI.getState().cup !== 'idle' || !validDiceAction(g.dice, 'bank', selectedDice())) return false
  void parkRuntime.actDice('bank', [...selectedDice()]); return true
}
export function toggleDie(id: number) {
  const g = useGame.getState().game
  if (!diceCanAct() || !g?.dice || g.dice.stage !== 'SELECTING' || useDiceUI.getState().cup !== 'idle'
    || !eligibleDice(g.dice.dice).includes(id)) return
  syncDiceUI()
  const ids = selectedDice()
  useDiceUI.setState({ selectedIds: ids.includes(id) ? ids.filter(n => n !== id) : [...ids, id] })
}
export function toggleScoreSheet() {
  cancelCup()
  const scoreOpen = !useDiceUI.getState().scoreOpen
  inputState.minigameOpen = scoreOpen
  useDiceUI.setState({ scoreOpen })
  if (scoreOpen) clearRoamingInput()
}
export function installDiceControls() {
  syncDiceUI()
  const unsubGame = useGame.subscribe((s, old) => {
    const next = s.game, prev = old.game
    if (!next?.dice) { resetDiceUI(); return }
    const animate = !!next?.dice?.dice.length && !!prev?.dice && next.gameId === prev.gameId && next.dice.rollId > prev.dice.rollId
      && (next.role === 'SPECTATOR' || (s.recovery === 'RESTORED' && old.recovery === 'RESTORED'))
    syncDiceUI(animate)
    if (s.pending || s.uncertain || s.recovery !== 'RESTORED') cancelCup()
  })
  const cancel = () => cancelCup()
  const unsubSession = useSession.subscribe((s, old) => {
    if (s.status !== 'connected' || s.sessionId !== old.sessionId || s.roomId !== old.roomId) resetDiceUI()
  })
  const down = (e: KeyboardEvent) => {
    if (!useGame.getState().game?.dice || inputState.manualOpen) return
    if (e.code === 'Escape' && (useDiceUI.getState().cup !== 'idle' || useDiceUI.getState().scoreOpen)) {
      e.preventDefault(); e.stopImmediatePropagation()
      if (useDiceUI.getState().scoreOpen) toggleScoreSheet(); else cancelCup()
      return
    }
    if (e.code === 'KeyT' && useDiceUI.getState().scoreOpen && !e.repeat && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); toggleScoreSheet(); return
    }
    if (e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || document.hidden
      || (e.target instanceof HTMLElement && !!e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))
      || Object.entries(inputState).some(([key, v]) => key !== 'minigameOpen' && v)) return
    if (e.code === 'KeyT') { e.preventDefault(); toggleScoreSheet() }
    if (e.code === 'KeyR') { e.preventDefault(); rollDice() }
    if (e.code === 'KeyQ') { e.preventDefault(); bankDice() }
  }
  window.addEventListener('ontop-manual-open', cancel); window.addEventListener('keydown', down, true); window.addEventListener('blur', cancel)
  document.addEventListener('visibilitychange', cancel)
  return () => {
    unsubGame(); unsubSession(); window.removeEventListener('ontop-manual-open', cancel); window.removeEventListener('keydown', down, true); window.removeEventListener('blur', cancel)
    document.removeEventListener('visibilitychange', cancel); resetDiceUI()
  }
}
