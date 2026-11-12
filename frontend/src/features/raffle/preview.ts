import { MAX_TICKET_NUMBER, type RaffleCurrent, type RafflePurchase, type RaffleTicket } from './protocol'
import { RaffleError } from './service'

const HOUR = 3_600_000
/** DEV에서 명시적으로 켠 화면 확인용 대역. 실제 엽전·서버와 연결되지 않으며 서버 실패 시 대체로 쓰지 않는다. */
export class PreviewRaffleService {
  private balance = 1000
  private tickets: RaffleTicket[] = []

  private window() {
    // 이번 주 월요일 00:00 KST(= 일요일 15:00 UTC) 기준으로 서버와 같은 판매 기간을 만든다.
    const kst = new Date(Date.now() + 9 * HOUR)
    const monday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - (kst.getUTCDay() + 6) % 7) - 9 * HOUR
    return { starts: monday + 9 * HOUR, ends: monday + 7 * 24 * HOUR, monday }
  }

  async current(): Promise<RaffleCurrent> {
    const { starts, ends, monday } = this.window()
    return { roundId: 1, weekStartDate: new Date(monday + 9 * HOUR).toISOString().slice(0, 10),
      salesStatus: Date.now() < starts ? 'SCHEDULED' : 'OPEN',
      salesStartsAt: new Date(starts).toISOString(), salesEndsAt: new Date(ends).toISOString(), ticketPrice: 100,
      weeklyLimit: 50, purchasedCount: this.tickets.length, remainingCount: 50 - this.tickets.length,
      balance: this.balance, reservedBalance: 0, availableBalance: this.balance, tickets: [...this.tickets] }
  }

  async purchase(): Promise<RafflePurchase> {
    await new Promise(resolve => setTimeout(resolve, 700))
    if (this.tickets.length >= 50) throw new RaffleError('이번 주 뽑기권을 모두 뽑았어요. 다음 주에 다시 만나요.', false)
    if (this.balance < 100) throw new RaffleError('사용 가능한 엽전이 부족해요. 경기 참가금으로 예약된 엽전은 쓸 수 없어요.', false)
    let ticketNumber = 0
    while (!ticketNumber || this.tickets.some(t => t.ticketNumber === ticketNumber))
      ticketNumber = 1 + Math.floor(Math.random() * MAX_TICKET_NUMBER)
    const ticket = { ticketId: this.tickets.length + 1, ticketNumber, purchasedAt: new Date().toISOString() }
    this.balance -= 100
    this.tickets.push(ticket)
    return { ...ticket, roundId: 1, purchasePrice: 100, balanceAfter: this.balance,
      purchasedCount: this.tickets.length, remainingCount: 50 - this.tickets.length }
  }
}
