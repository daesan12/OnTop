import { useGame } from '../../game/store'
import { useBungeoppang } from '../bungeoppang/store'
import { useJumpmap } from '../jumpmap/state'
import { useJumpRope } from '../jumpRope/store'
import { useMole } from '../mole/store'
import { tableGameplayActive } from '../parkMenus/gameplayLock'
import { usePlusMinus } from '../plusMinus/store'
import { useRpsRoulette } from '../rpsRoulette/store'
import { useSkewerActivity } from '../skewer/activity'
import { useSpeedMole } from '../speedMole/store'

export const bungeoppangGameplayActive = (state: ReturnType<typeof useBungeoppang.getState>) =>
  ['countdown', 'play', 'ending', 'leaving'].includes(state.phase)
  || state.starting || state.recovering || state.submitting || state.abandonPending

const moleGameplayActive = (state: ReturnType<typeof useMole.getState>) =>
  !['idle', 'result'].includes(state.phase)

const plusMinusGameplayActive = (state: ReturnType<typeof usePlusMinus.getState>) =>
  state.busy === 'start' || state.revealing !== null

const rpsGameplayActive = (state: ReturnType<typeof useRpsRoulette.getState>) =>
  state.busy === 'start' || state.data?.round?.phase === 'DUEL' || state.data?.round?.phase === 'DECIDE'

/** 배출 중에도 정산까지 기다려야 하는 클라이언트 게임 상태를 한곳에서 판정한다. */
export function useParkGameplayActive() {
  const table = useGame(tableGameplayActive)
  const bungeoppang = useBungeoppang(bungeoppangGameplayActive)
  const mole = useMole(moleGameplayActive)
  const plusMinus = usePlusMinus(plusMinusGameplayActive)
  const rps = useRpsRoulette(rpsGameplayActive)
  const jumpmap = useJumpmap(state => state.run !== null || state.recovering)
  const jumpRope = useJumpRope(state => state.active)
  const skewer = useSkewerActivity(state => state.solo || state.cooperative)
  return table || bungeoppang || mole || plusMinus || rps || jumpmap || jumpRope || skewer
}

export function parkMinigameInUse() {
  return useMole.getState().open || usePlusMinus.getState().open || useRpsRoulette.getState().open
    || useJumpRope.getState().open || useSkewerActivity.getState().solo || useSkewerActivity.getState().cooperative
    || useSpeedMole.getState().open
}
