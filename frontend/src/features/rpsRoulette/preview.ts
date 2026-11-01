import { DAILY_PLAYS, FEES, MULTIPLIERS, ROULETTE, type RpsRound, type RpsState } from './protocol'
import { HANDS, type Hand } from './ledHands'
import { RpsRouletteError } from './service'

/** DEV에서 명시적으로 켠 화면 확인용 대역. 실제 엽전·서버와 연결되지 않으며 서버 실패 시 대체로 쓰지 않는다. */
export class PreviewRpsRouletteService {
  private balance = 300
  private played = 0
  private round: RpsRound | null = null
  private machine: Hand = 'ROCK'

  private state(): RpsState {
    return { serverNow: new Date().toISOString(), availableBalance: this.balance, playedToday: this.played,
      rules: { fees: [...FEES], dailyPlays: DAILY_PLAYS, multipliers: [...MULTIPLIERS], roulette: [...ROULETTE],
        duelLimitMs: 5000, decideLimitMs: 10000, graceMs: 1500 }, round: this.round && { ...this.round } }
  }

  private arm(round: RpsRound, ms: number) {
    const now = Date.now()
    round.inputEndsAt = new Date(now + ms).toISOString()
    round.deadlineAt = new Date(now + ms + 1500).toISOString()
  }

  private expire() {
    const r = this.round
    if (!r || r.phase === 'SETTLED' || Date.parse(r.deadlineAt!) > Date.now()) return
    if (r.phase === 'DUEL') this.reveal(HANDS[Math.floor(Math.random() * 3)], true)
    else this.spin()
  }

  private reveal(player: Hand, auto: boolean) {
    const r = this.round!, machine = this.machine
    const diff = (HANDS.indexOf(machine) - HANDS.indexOf(player) + 3) % 3
    const result = diff === 0 ? 'DRAW' : diff === 1 ? 'WIN' : 'LOSE'
    r.lastDuel = { duelNo: r.duelNo, playerHand: player, machineHand: machine, salt: 'preview', result, auto }
    r.seq++
    if (result === 'DRAW') { r.duelNo++; this.machine = HANDS[Math.floor(Math.random() * 3)]; this.arm(r, 5000); return }
    if (result === 'LOSE') { Object.assign(r, { phase: 'SETTLED', outcome: 'LOST', inputEndsAt: null, deadlineAt: null, settledAt: new Date().toISOString() }); return }
    if (r.challenging) { r.stakeLevel++; r.challenging = false; r.multiplier = MULTIPLIERS[r.stakeLevel] }
    r.phase = 'DECIDE'; r.commitment = null; this.arm(r, 10000)
    if (r.stakeLevel >= 2) this.spin()
  }

  private spin() {
    const r = this.round!, cell = Math.floor(Math.random() * ROULETTE.length)
    r.seq++
    Object.assign(r, { phase: 'SETTLED', outcome: 'PAID', rouletteCell: cell, rouletteValue: ROULETTE[cell],
      payout: Math.round(r.fee * ROULETTE[cell] * r.multiplier), inputEndsAt: null, deadlineAt: null, settledAt: new Date().toISOString() })
    this.balance += r.payout
  }

  async status() { this.expire(); return this.state() }

  async start(fee: number) {
    this.expire()
    if (this.round && this.round.phase !== 'SETTLED') throw new RpsRouletteError('진행 중인 판이 있어요.', false, 'RPS_ROUND_IN_PROGRESS')
    if (this.played >= DAILY_PLAYS) throw new RpsRouletteError('오늘 15판을 모두 했어요. 내일 다시 만나요.', false, 'RPS_DAILY_LIMIT')
    if (this.balance < fee) throw new RpsRouletteError('엽전이 부족해요. 참가비를 확인해 주세요.', false, 'INSUFFICIENT_COINS')
    this.balance -= fee; this.played++
    this.machine = HANDS[Math.floor(Math.random() * 3)]
    this.round = { id: String(this.played), fee, phase: 'DUEL', seq: 1, stakeLevel: 0, multiplier: 1, challenging: false, duelNo: 1,
      commitment: 'preview', inputEndsAt: null, deadlineAt: null, lastDuel: null, outcome: null, rouletteCell: null,
      rouletteValue: null, payout: 0, startedAt: new Date().toISOString(), settledAt: null }
    this.arm(this.round, 5000)
    return this.state()
  }

  async hand(_id: string, seq: number, hand: Hand) {
    this.expire()
    if (this.round?.phase === 'DUEL' && this.round.seq === seq) this.reveal(hand, false)
    return this.state()
  }

  async challenge(_id: string, seq: number) {
    this.expire()
    const r = this.round
    if (r?.phase === 'DECIDE' && r.seq === seq && r.stakeLevel < 2) {
      r.seq++; r.duelNo++; r.challenging = true; r.phase = 'DUEL'; r.commitment = 'preview'
      this.machine = HANDS[Math.floor(Math.random() * 3)]; this.arm(r, 5000)
    }
    return this.state()
  }

  async stop(_id: string, seq: number) {
    this.expire()
    if (this.round?.phase === 'DECIDE' && this.round.seq === seq) this.spin()
    return this.state()
  }
}
