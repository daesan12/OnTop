import { DAILY_CAP, REWARDS, STAGES } from './course'
import type { useJumpmap } from './state'

export type JumpmapXRState = ReturnType<typeof useJumpmap.getState>
export type JumpmapXRAction = 'continue' | 'ranking' | 'back' | 'previous' | 'next' | 'retry'
export interface JumpmapXRView {
  key: string; title: string; lines: string[]
  buttons: { id: JumpmapXRAction; label: string }[]
}
export const xrTime = (ms: number) => {
  const centiseconds = Math.floor(Math.max(0, ms) / 10)
  return `${Math.floor(centiseconds / 6000)}분 ${((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0')}초`
}

/** Presentation only. Completion and coins always come from the existing server store. */
export function jumpmapXRView(s: JumpmapXRState, now: number, guide: boolean): JumpmapXRView {
  const result = s.completion && s.result?.runId === s.completion.runId ? s.result : null
  if (result) {
    const total = REWARDS.reduce((sum, reward) => sum + reward, 0)
    const capped = s.todayEarned !== null && s.todayEarned >= DAILY_CAP
    const confirming = s.todayEarned === null || result.runCoins < total && !capped
    return { key: `result:${result.runId}`, title: '돌탑 도전 완료', lines: [
      '마지막 연잎까지 멋지게 완주했어요!',
      result.finishMs === undefined ? '기록 확인 중…' : `완주 시간  ${xrTime(result.finishMs)}`,
      `이번 도전 받은 엽전  ${result.runCoins}냥`,
      `오늘 미니게임 합산  ${s.todayEarned ?? '—'} / ${DAILY_CAP}냥`,
      confirming ? '기록과 구간 보상을 확인하고 있어요.' : capped ? '오늘 보상 한도에 도달했어요. 기록 도전은 계속할 수 있어요.' : '구간 보상이 반영됐어요.',
      s.bestFinishMs === null ? '' : `내 최고 기록  ${xrTime(s.bestFinishMs)}`,
      '계속하기 후 호수로 내려가거나 공원을 둘러보세요.',
    ].filter(Boolean), buttons: [{ id: 'ranking', label: '타임어택 랭킹' }, { id: 'continue', label: '계속하기 · A' }] }
  }
  if (guide) return { key: 'guide', title: '돌탑 점프맵 · VR 안내', lines: [
    '첫 번째 돌에 착지하면 도전이 시작돼요.',
    '왼쪽 스틱 이동 · 왼손 그립을 누른 채 달리기',
    'A 버튼 점프 · 오른쪽 스틱 30도 회전',
    '석탑부터 연잎까지 일곱 구간을 순서대로 통과해요.',
    `구간 보상 합계 ${REWARDS.reduce((sum, reward) => sum + reward, 0)}냥 · 하루 합산 ${DAILY_CAP}냥 한도`,
    '마지막 연잎에서 완주! 떨어져도 받은 엽전은 그대로예요.',
    '실제로 뛰지 않고 버튼으로 점프해요. B로 VR을 종료해요.',
  ], buttons: [{ id: 'continue', label: '안내 닫기 · A' }] }
  const run = s.run, stage = STAGES[Math.min(6, run?.gatesPassed ?? 0)]!
  const receipt = s.popup && now - s.popup.at < 1400
    ? s.popup.anticipated || s.popup.amount === null || /정산|확인/.test(s.popup.label) ? '구간 보상 확인 중…' : `구간 보상 +${s.popup.amount}냥` : ''
  return { key: 'roaming', title: run ? `돌탑 · ${stage.name}  ${Math.min(7, run.gatesPassed + 1)} / 7구간` : '공원 VR · 돌탑 점프맵', lines: run ? [
    `${xrTime(now - run.startedAt)}   ·   이번 ${run.runCoins}냥`,
    receipt || 'A 점프 · 왼손 그립 달리기 · X 놀이 방법',
  ] : [
    s.recovering ? '도전 상태를 다시 확인하고 있어요…'
      : s.result && now < s.result.until ? s.result.reason === 'FALL' || s.result.reason === 'LAKE'
        ? '첫 발판으로 돌아가 다시 도전해요. 받은 엽전은 유지돼요.' : '도전이 종료됐어요. 첫 발판에서 다시 시작해요.'
        : '왼쪽 스틱 이동 · A 점프 · 오른쪽 스틱 회전',
    s.checked && !s.available ? s.error || '점프맵 연결을 준비하고 있어요.' : 'X 놀이 방법 · 왼손 그립 달리기 · B VR 종료',
  ], buttons: [] }
}
