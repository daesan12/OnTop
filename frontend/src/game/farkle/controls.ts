import { create } from 'zustand'
import { useGame, canPlayDice } from '../store'
import { useSession } from '../../network/worldClient'
import { inputState, clearRoamingInput } from '../../world/inputOwnership'
import { resetSeatedLook } from '../../features/tableLobby/state'
import { parkRuntime } from '../../park/runtime/runtime'
import { eligibleDice, validDiceAction } from './scoring'
import { disposeDiceSound, unlockDiceSound } from './sound'
import { bustMatches, createBustPresentation, DICE_ROLL_MS, type BustPresentation } from './bustPresentation'

const initial = () => ({ scope: '', selectedIds: [] as number[], cup: 'idle' as 'idle' | 'holding' | 'ready', scoreOpen: false,
  animationAt: 0, animationUntil: 0, boardView: false, bust: null as BustPresentation | null })
export const useDiceUI = create(initial)
export const diceCamera = { ready: false }
export const cupMotion = { x: 0.91, z: 0.4, lift: 0, cancel: () => {} }
let bustTimers: ReturnType<typeof setTimeout>[] = []
function cancelBustTimers() { bustTimers.forEach(clearTimeout); bustTimers = [] }
function clearBustPresentation() {
  cancelBustTimers()
  if (useDiceUI.getState().bust) useDiceUI.setState({ bust: null, animationAt: 0, animationUntil: 0 })
}
export function holdBustCamera(gameId: string | undefined, ownId: string) {
  const bust = useDiceUI.getState().bust
  return !!bust && bust.gameId === gameId && bust.actorId === ownId && performance.now() < bust.until
}
function startBustPresentation(bust: BustPresentation) {
  cancelBustTimers()
  useDiceUI.setState({ bust })
  bustTimers = [setTimeout(() => {
    if (useDiceUI.getState().bust?.key !== bust.key) return
    if (!bustMatches(useGame.getState().game, bust)) { clearBustPresentation(); return }
    useDiceUI.setState({ bust: { ...bust, phase: 'result' } })
  }, DICE_ROLL_MS), setTimeout(() => {
    if (useDiceUI.getState().bust?.key === bust.key) clearBustPresentation()
  }, bust.until - bust.at)]
}
export const diceScope = () => {
  const g = useGame.getState().game, s = useSession.getState()
  return g?.dice ? `${s.sessionId}/${s.roomId}/${g.gameId}/${g.version}` : ''
}
export function resetDiceUI() {
  cancelBustTimers()
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
  const bust = useDiceUI.getState().bust, keepBust = bustMatches(useGame.getState().game, bust) && now < bust!.until
  useDiceUI.setState({ scope: diceScope(), selectedIds: [], animationAt: keepBust ? bust!.at : animate ? now : 0,
    animationUntil: keepBust ? bust!.until : animate ? now + DICE_ROLL_MS : 0 })
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
  unlockDiceSound()
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
/** Public animation state is shared, while spectators never install player key handlers. */
export function installDicePresentation() {
  syncDiceUI()
  const unsubGame = useGame.subscribe((s, old) => {
    const next = s.game, prev = old.game
    if (!next?.dice) { resetDiceUI(); return }
    const session = useSession.getState(), ui = useDiceUI.getState()
    const live = session.status === 'connected' && (next.role === 'SPECTATOR' && prev?.role === 'SPECTATOR'
      || s.recovery === 'RESTORED' && old.recovery === 'RESTORED')
    const previousScope = prev ? `${session.sessionId}/${session.roomId}/${prev.gameId}/${prev.version}` : ''
    const selected = next.role === 'PLAYER' && prev?.dice?.turnUserId === session.sessionId && ui.scope === previousScope ? ui.selectedIds : null
    const bust = live ? createBustPresentation(prev, next, selected, performance.now()) : null
    if (ui.bust && (!live || !bustMatches(next, ui.bust))) clearBustPresentation()
    if (bust) startBustPresentation(bust)
    const animate = !!next?.dice?.dice.length && !!prev?.dice && next.gameId === prev.gameId && next.dice.rollId > prev.dice.rollId
      && (next.role === 'SPECTATOR' || (s.recovery === 'RESTORED' && old.recovery === 'RESTORED'))
    syncDiceUI(animate)
    if (s.pending || s.uncertain || s.recovery !== 'RESTORED') cancelCup()
  })
  const unsubSession = useSession.subscribe((s, old) => {
    if (s.status !== 'connected' || s.sessionId !== old.sessionId || s.roomId !== old.roomId) resetDiceUI()
  })
  return () => { unsubGame(); unsubSession(); resetDiceUI(); disposeDiceSound() }
}
export function installDiceControls() {
  resetSeatedLook()
  const disposePresentation = installDicePresentation()
  const cancel = () => { cancelCup(); if (document.hidden) clearBustPresentation() }
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
      || (e.target instanceof HTMLElement && !!e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog[open],.game-hud-menu'))
      || Object.entries(inputState).some(([key, v]) => key !== 'minigameOpen' && v)) return
    if (e.code === 'KeyT') { e.preventDefault(); toggleScoreSheet() }
    if (e.code === 'KeyR') { e.preventDefault(); rollDice() }
    if (e.code === 'KeyQ') { e.preventDefault(); bankDice() }
  }
  window.addEventListener('ontop-manual-open', cancel); window.addEventListener('keydown', down, true); window.addEventListener('blur', cancel)
  window.addEventListener('ontop-browser-interrupt', cancel)
  document.addEventListener('visibilitychange', cancel)
  return () => {
    disposePresentation(); window.removeEventListener('ontop-manual-open', cancel); window.removeEventListener('keydown', down, true); window.removeEventListener('blur', cancel)
    window.removeEventListener('ontop-browser-interrupt', cancel)
    document.removeEventListener('visibilitychange', cancel)
  }
}
