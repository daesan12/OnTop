import { useWelcomeTour } from '../welcomeTour/state'
import { currentStep } from '../welcomeTour/steps'
import { logBehavior, type OnboardingStepProps, type TourStepName } from './client'

/**
 * 첫 입장 체험 투어의 상태 변화를 ONBOARDING_STEP으로 남긴다. 투어 코드는 바꾸지 않고 상태만 구독한다.
 * - 첫 입장: 비행 시작(start) → 비행 끝(step_done flight) → 단계 완료(step_done) → 모두 마침(finish)
 * - 설명서의 다시 보기: 비행 없이 start(replay=true)
 * - 접기/이어 하기: collapse/resume
 * - 마치기 전에 닫거나 공원을 떠나면 abandon과 그때 하던 단계
 */
export function watchWelcomeTour(log = logBehavior, clock = () => performance.now()) {
  let startedAt = clock(), replay = false
  const emit = (action: OnboardingStepProps['action'], doneCount: number, step?: TourStepName) => log({
    type: 'ONBOARDING_STEP',
    props: {
      flow: 'welcome_tour', action, ...(step ? { step } : {}), replay, doneCount,
      elapsedSec: Math.min(86_400, Math.max(0, Math.round((clock() - startedAt) / 1000))),
    },
  })
  return useWelcomeTour.subscribe((state, old) => {
    if (state.phase === 'flight' && old.phase !== 'flight') {
      startedAt = clock()
      replay = false
      emit('start', 0)
      return
    }
    if (state.phase === 'tour' && old.phase === 'flight') emit('step_done', 0, 'flight')
    if (state.phase === 'tour' && (old.phase === 'idle' || old.phase === 'finished')) {
      startedAt = clock()
      replay = true
      emit('start', 0)
    }
    if (state.phase === 'tour' || state.phase === 'finished') {
      const before = old.phase === 'tour' ? old.done : []
      for (const step of state.done) if (!before.includes(step)) emit('step_done', state.done.length, step)
    }
    if (state.phase === 'finished' && old.phase === 'tour') emit('finish', state.done.length)
    if (state.phase === 'tour' && old.phase === 'tour' && state.collapsed !== old.collapsed)
      emit(state.collapsed ? 'collapse' : 'resume', state.done.length)
    if (state.phase === 'idle' && (old.phase === 'tour' || old.phase === 'flight'))
      emit('abandon', old.done.length, old.phase === 'flight' ? 'flight' : currentStep(old.done)?.id)
  })
}
