import { DAILY_PLAYS, FEE, FIRST_REEL, JACKPOT, OPERATOR_REEL, SECOND_REEL, type PlusMinusRound, type PlusMinusState } from './protocol'
import { PlusMinusError } from './service'

/** DEV에서 명시적으로 켠 화면 확인용 대역. 실제 엽전·서버와 연결되지 않으며 서버 실패 시 대체로 쓰지 않는다. */
export class PreviewPlusMinusService {
  private balance = 300
  private played = 0
  private round: PlusMinusRound | null = null

  private state(): PlusMinusState {
    return { serverNow: new Date().toISOString(), availableBalance: this.balance, playedToday: this.played,
      rules: { fee: FEE, dailyPlays: DAILY_PLAYS, firstReel: [...FIRST_REEL], operatorReel: [...OPERATOR_REEL],
        secondReel: [...SECOND_REEL], pointPayout: 10, jackpotFirst: 7, jackpotPayout: 500 }, round: this.round && { ...this.round } }
  }

  async status() { return this.state() }

  async start() {
    if (this.balance < FEE) throw new PlusMinusError('엽전이 부족해요. 참가비 30냥이 필요해요.', false, 'INSUFFICIENT_COINS')
    const pick = (n: number) => Math.floor(Math.random() * n)
    const firstCell = pick(FIRST_REEL.length), operatorCell = pick(OPERATOR_REEL.length), secondCell = pick(SECOND_REEL.length)
    const first = FIRST_REEL[firstCell], operator = OPERATOR_REEL[operatorCell], second = SECOND_REEL[secondCell]
    const result = second === JACKPOT ? null : operator === '+' ? first + second : first - second
    const outcome = result === null ? first === 7 ? 'JACKPOT' : 'LOST' : result >= 1 ? 'PAID' : 'LOST'
    const payout = outcome === 'JACKPOT' ? 500 : outcome === 'PAID' ? result! * 10 : 0
    this.played++
    this.balance += payout - FEE
    this.round = { id: String(this.played), firstCell, operatorCell, secondCell, first, operator, second, result, outcome,
      payout, playedAt: new Date().toISOString() }
    return this.state()
  }
}
