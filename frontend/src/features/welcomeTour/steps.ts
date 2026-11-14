import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'

/** 설명서 '처음 3분 동안 해 보기'를 직접 해 보는 순서. 순서와 상관없이 해낸 단계가 체크된다. */
export const TOUR_STEPS = [
  { id: 'walk', title: '걸어 보기', hint: 'WASD나 방향키로 걷고, Shift를 누른 채 달려 보세요.' },
  { id: 'greet', title: '인사하기', hint: 'Enter로 채팅을 보내거나 G로 손 인사를 해 보세요.' },
  { id: 'map', title: '지도로 길 찾기', hint: RENEWAL_PARK_ENABLED
    ? 'M으로 지도를 열고 중앙광장이나 자전거·킥보드 대여소를 골라 걸어가 보세요.'
    : 'M으로 지도를 열고 가 보고 싶은 장소를 골라 보세요.' },
  { id: 'minigame', title: '혼자 한 판', hint: RENEWAL_PARK_ENABLED
    ? '붕어빵 가게나 오락실의 게임기 앞에서 E를 눌러 보세요. 창만 열어도 돼요.'
    : '붕어빵 카트나 오락기 앞에서 E를 눌러 보세요. 창만 열어도 돼요.' },
  { id: 'table', title: '함께 한 판', hint: RENEWAL_PARK_ENABLED
    ? '중앙광장의 돌테이블이나 팔각정 테이블 가까이에서 E로 앉거나 관전해 보세요.'
    : '게임마당 테이블 가까이에서 E로 앉거나 관전해 보세요.' },
] as const

export type TourStepId = (typeof TOUR_STEPS)[number]['id']
/** 걷기를 뺀 단계는 이미 있는 동작이 알려 준다. */
export type TourAction = 'chat' | 'emote' | 'navigate' | 'minigame' | 'table'

/** 이만큼(m) 걸으면 걷기 단계를 마친다. */
export const TOUR_WALK_GOAL = 8

const ACTION_STEP: Record<TourAction, TourStepId> = {
  chat: 'greet', emote: 'greet', navigate: 'map', minigame: 'minigame', table: 'table',
}

export const stepForAction = (action: TourAction) => ACTION_STEP[action]

export function completeStep(done: readonly TourStepId[], step: TourStepId): TourStepId[] {
  return done.includes(step) ? [...done] : TOUR_STEPS.map(s => s.id).filter(id => id === step || done.includes(id))
}

/** 아직 하지 않은 첫 단계. 모두 마쳤으면 null. */
export const currentStep = (done: readonly TourStepId[]) => TOUR_STEPS.find(s => !done.includes(s.id)) ?? null

/** 순간 이동·재접속처럼 한 번에 크게 바뀐 좌표는 걸은 거리로 치지 않는다. */
export function walkedDistance(previous: { x: number; z: number }, next: { x: number; z: number }) {
  const step = Math.hypot(next.x - previous.x, next.z - previous.z)
  return Number.isFinite(step) && step <= 3 ? step : 0
}
