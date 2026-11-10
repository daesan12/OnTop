import { HAND_LABEL } from './ledHands'
import type { RpsRound } from './protocol'

export interface StatusInput {
  round: RpsRound | null
  busy: string | null
  error: string
  revealing: boolean
  spinning: boolean
  timeUp: boolean
  playsLeft: number
}

const times = (value: number) => `×${value.toFixed(1)}`

/** 서버 상태와 연출 단계를 안내 문구 한 줄로 바꾼다. 결과는 서버 값만 사용한다. */
export function statusLine({ round, busy, error, revealing, spinning, timeUp, playsLeft }: StatusInput) {
  if (error) return error
  if (busy === 'start') return '엽전을 넣고 있어요…'
  if (busy === 'status' && !round) return '게임기 상태를 불러오고 있어요…'
  const duel = round?.lastDuel
  const versus = duel ? `${duel.auto ? '시간 초과 · 자동 ' : '나 '}${HAND_LABEL[duel.playerHand]} : 기계 ${HAND_LABEL[duel.machineHand]}` : ''
  if (round && revealing && duel)
    return `${versus} · ${duel.result === 'WIN' ? '이겼다!' : duel.result === 'DRAW' ? '비겼다! 다시' : round.challenging ? '도전 실패 · 꽝' : '졌다'}`
  if (spinning) return '룰렛이 돌아가요'
  if (!round || round.phase === 'SETTLED') {
    const prompt = playsLeft > 0 ? '참가비를 고르고 START를 눌러요' : '오늘 15판을 모두 했어요. 내일 다시 만나요.'
    if (!round) return prompt
    if (round.outcome === 'PAID')
      return `${round.fee}냥 × ${round.rouletteValue}칸 × ${round.multiplier.toFixed(1)} = ${round.payout}냥 · ${prompt}`
    return `${round.challenging ? '도전 실패 · 꽝' : '졌어요'} · ${prompt}`
  }
  if (round.phase === 'DUEL') {
    if (busy === 'hand') return '손을 내고 있어요…'
    if (timeUp) return '시간이 끝났어요. 서버 판정을 확인하고 있어요.'
    if (round.challenging) return `도전 ${round.stakeLevel + 1}차! 가위바위보! · 이기면 ${times(round.stakeLevel === 0 ? 2 : 4)}`
    return '가위바위보! 5초 안에 손 버튼을 눌러요'
  }
  if (busy === 'stop') return '룰렛을 돌리고 있어요…'
  if (busy === 'challenge') return '도전을 준비하고 있어요…'
  if (timeUp) return '시간이 끝났어요. 자동으로 멈추고 있어요.'
  return round.stakeLevel === 0 ? '이겼다! 멈출까요? 도전 1차 ×2.0 → 2차 ×4.0' : '1차 성공 ×2.0 · 마지막 2차 ×4.0에 도전할까요?'
}
