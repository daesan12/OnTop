import { create } from 'zustand'
import { avatars, useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { gameplayMenusLocked } from '../parkMenus/gameplayLock'
import { useJumpmap } from '../jumpmap/state'
import { closeManual, useManual } from '../manual/manualState'
import { welcomeFlight } from './flight'
import { completeStep, currentStep, stepForAction, TOUR_WALK_GOAL, type TourAction, type TourStepId } from './steps'

export type TourPhase = 'idle' | 'flight' | 'tour' | 'finished'
const initial = () => ({ phase: 'idle' as TourPhase, owner: '', done: [] as TourStepId[], walked: 0, collapsed: false })
export const useWelcomeTour = create(initial)

let replayPending = false

const presented = () => performance.getEntriesByName('park-scene-presented').length > 0
/** 연결·맵·내 캐릭터·첫 화면이 모두 준비된 뒤에만 연출을 시작한다. */
export function welcomeReady() {
  const s = useSession.getState()
  return s.status === 'connected' && !!s.roomId && s.mapCompatible && avatars.has(s.sessionId) && presented()
}

function releaseFlight() {
  welcomeFlight.active = false
  inputState.welcomeFlight = false
}

/** 움직임 줄이기 설정이면 카메라는 그대로 두고 같은 시간 동안 환영 카드만 보여 준다. */
export function beginWelcomeFlight(reducedMotion: boolean) {
  const owner = useSession.getState().sessionId
  inputState.welcomeFlight = true
  clearRoamingInput()
  Object.assign(welcomeFlight, { active: !reducedMotion, startedAt: performance.now() })
  useWelcomeTour.setState({ ...initial(), phase: 'flight', owner })
}
export function finishWelcomeFlight() {
  if (useWelcomeTour.getState().phase !== 'flight') return
  releaseFlight()
  useWelcomeTour.setState({ ...initial(), phase: 'tour', owner: useWelcomeTour.getState().owner })
}

/** 다시 보기를 막는 이유. 빈 문자열이면 시작할 수 있다. */
export function tourBlockReason() {
  const s = useSession.getState()
  if (s.status !== 'connected' || !s.roomId || !avatars.has(s.sessionId)) return '공원에 연결된 뒤에 시작할 수 있어요.'
  if (useWelcomeTour.getState().phase === 'flight') return '환영 연출이 끝나면 시작할 수 있어요.'
  if (s.tableId || s.watchedTableId || s.benchId || s.fitnessId || s.telescopeId || gameplayMenusLocked() || useJumpmap.getState().run)
    return '테이블·시설 이용이나 게임을 마친 뒤에 시작할 수 있어요.'
  return ''
}

/** 다시 보기는 비행 없이 1단계부터 시작한다. 설명서에서 누르면 설명서가 닫힌 뒤 시작한다. */
export function replayWelcomeTour() {
  if (tourBlockReason()) return false
  if (useManual.getState().open) {
    replayPending = true
    closeManual()
    return true
  }
  if (panelOwnsKeys()) return false
  startReplay()
  return true
}
const startReplay = () => useWelcomeTour.setState({ ...initial(), phase: 'tour', owner: useSession.getState().sessionId })
/** 설명서가 닫힌 순간 미뤄 둔 다시 보기를 시작한다. 이때는 설명서 자신의 입력 잠금이 아직 풀리는 중이라 따로 보지 않는다. */
export function takeReplayAfterManual() {
  const pending = replayPending
  replayPending = false
  if (!pending || tourBlockReason()) return false
  startReplay()
  return true
}

function mark(step: TourStepId) {
  const state = useWelcomeTour.getState()
  if (state.phase !== 'tour' || state.owner !== useSession.getState().sessionId) return
  const done = completeStep(state.done, step)
  useWelcomeTour.setState(currentStep(done) ? { done } : { done, phase: 'finished', collapsed: false })
}
/** 채팅·이모트·길 안내·미니게임·테이블이 성공했을 때 각 기능이 알려 준다. */
export function noteTourAction(action: TourAction) { mark(stepForAction(action)) }
export function noteTourWalk(distance: number) {
  const state = useWelcomeTour.getState()
  if (state.phase !== 'tour' || state.done.includes('walk') || distance <= 0) return
  const walked = state.walked + distance
  if (walked >= TOUR_WALK_GOAL) mark('walk')
  else useWelcomeTour.setState({ walked })
}

export const setTourCollapsed = (collapsed: boolean) => useWelcomeTour.setState({ collapsed })
/** 투어 종료·완료 카드 닫기. 공원을 나가거나 채널을 옮길 때도 이것으로 정리한다. */
export function endWelcomeTour() {
  releaseFlight()
  replayPending = false
  useWelcomeTour.setState(initial(), true)
}
