import { operatorLabel, reelLabel, type PlusMinusRound } from './protocol'

export interface StatusInput {
  round: PlusMinusRound | null
  busy: string | null
  error: string
  /** 아직 멈추지 않은 릴 수. 0이면 결과를 공개한다. */
  spinning: number
  playsLeft: number
}

/** `7 + 5 = 12`처럼 멈춘 세 칸을 계산식으로 적는다. JACKPOT 칸은 계산하지 않는다. */
export function formula(round: PlusMinusRound) {
  const head = `${round.first} ${operatorLabel(round.operator)} ${reelLabel(round.second)}`
  return round.result === null ? head : `${head} = ${round.result}`
}

export function resultLine(round: PlusMinusRound) {
  if (round.outcome === 'JACKPOT') return `${formula(round)}! 대박 ${round.payout}냥`
  if (round.outcome === 'PAID') return `${formula(round)} → ${round.payout}냥`
  return round.result === null ? `${formula(round)} · 7이 아니라 꽝` : `${formula(round)} · 꽝`
}

/** 서버 결과와 연출 단계를 안내 문구 한 줄로 바꾼다. 결과는 서버 값만 사용한다. */
export function statusLine({ round, busy, error, spinning, playsLeft }: StatusInput) {
  if (error) return error
  if (busy === 'start') return '엽전을 넣고 있어요…'
  if (busy === 'status' && !round) return '게임기 상태를 불러오고 있어요…'
  if (spinning > 0) return `${4 - spinning}번 정지 버튼을 눌러요 · 5초가 지나면 저절로 멈춰요`
  const prompt = playsLeft > 0 ? '30냥 넣고 START를 눌러요' : '오늘 10판을 모두 했어요. 내일 다시 만나요.'
  return round ? `${resultLine(round)} · ${prompt}` : prompt
}
