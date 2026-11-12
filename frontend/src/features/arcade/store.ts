import { create } from 'zustand'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { openMole, refreshMole } from '../mole/store'
import { openPlusMinus, refreshPlusMinus } from '../plusMinus/store'
import { openRpsRoulette, refreshRpsRoulette } from '../rpsRoulette/store'
import { openSpeedMole } from '../speedMole/store'

export type ArcadeGame = 'rps-roulette' | 'plus-minus' | 'whack-a-mole' | 'speed-mole'
type ArcadeScope = 'all' | 'mole'

export const useArcade = create<{ open: boolean; selected: ArcadeGame; scope: ArcadeScope }>(() => ({
  open: false, selected: 'rps-roulette', scope: 'all',
}))

export function openArcade(scope: ArcadeScope = 'all') {
  const current = useArcade.getState()
  if (current.open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  const selected = scope === 'mole' && current.selected !== 'speed-mole' ? 'whack-a-mole' : current.selected
  useArcade.setState({ open: true, scope, selected })
  // 고르는 화면에 오늘 남은 판·진행 중인 판·오늘 받은 엽전을 보여 주려고 게임 상태를 미리 읽는다.
  if (scope === 'all') {
    void refreshRpsRoulette()
    void refreshPlusMinus()
  }
  void refreshMole()
}

export function closeArcade() {
  inputState.minigameOpen = false
  useArcade.setState({ open: false })
}

export const selectArcadeGame = (selected: ArcadeGame) => useArcade.setState({ selected })

/** 고른 게임 창을 연다. 각 게임 창이 입력 소유권을 다시 가져간다. */
export function playArcadeGame(game = useArcade.getState().selected) {
  closeArcade()
  if (game === 'rps-roulette') openRpsRoulette()
  else if (game === 'plus-minus') openPlusMinus()
  else if (game === 'speed-mole') openSpeedMole()
  else openMole()
}
