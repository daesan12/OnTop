import { integer, record } from '../../network/protocol'

/** 서버 계약: GET /api/v1/raffles/current, POST /api/v1/raffles/current/tickets. 번호는 서버만 배정한다. */
export type SalesStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED'
export interface RaffleTicket { ticketId: number; ticketNumber: number; purchasedAt: string }
export interface RaffleCurrent {
  roundId: number; weekStartDate: string; salesStatus: SalesStatus; salesStartsAt: string; salesEndsAt: string
  ticketPrice: number; weeklyLimit: number; purchasedCount: number; remainingCount: number
  balance: number; reservedBalance: number; availableBalance: number; tickets: RaffleTicket[]
}
export interface RafflePurchase {
  ticketId: number; roundId: number; ticketNumber: number; purchasePrice: number; purchasedAt: string
  balanceAfter: number; purchasedCount: number; remainingCount: number
}

export const MAX_TICKET_NUMBER = 10_000
export const BOARD_COLS = 16
export const BOARD_ROWS = 15
const BOARD_CELLS = BOARD_COLS * BOARD_ROWS

const positive = (v: unknown): v is number => integer(v) && v > 0
const time = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const number = (v: unknown): v is number => positive(v) && v <= MAX_TICKET_NUMBER
const invalid = (): never => { throw new Error('응모 정보를 확인하지 못했어요.') }

function ticket(v: unknown): RaffleTicket {
  if (!record(v) || !positive(v.ticketId) || !number(v.ticketNumber) || !time(v.purchasedAt)) return invalid()
  return { ticketId: v.ticketId, ticketNumber: v.ticketNumber, purchasedAt: v.purchasedAt }
}

export function parseCurrent(v: unknown): RaffleCurrent {
  if (!record(v) || !positive(v.roundId) || typeof v.weekStartDate !== 'string'
    || !['SCHEDULED', 'OPEN', 'CLOSED'].includes(String(v.salesStatus)) || !time(v.salesStartsAt) || !time(v.salesEndsAt)
    || !positive(v.ticketPrice) || !positive(v.weeklyLimit) || !integer(v.purchasedCount) || !integer(v.remainingCount)
    || !integer(v.balance) || !integer(v.reservedBalance) || !integer(v.availableBalance)
    || v.balance - v.reservedBalance !== v.availableBalance || !Array.isArray(v.tickets)) return invalid()
  const tickets = v.tickets.map(ticket)
  if (tickets.length !== v.purchasedCount || new Set(tickets.map(t => t.ticketNumber)).size !== tickets.length) return invalid()
  return { roundId: v.roundId, weekStartDate: v.weekStartDate, salesStatus: v.salesStatus as SalesStatus,
    salesStartsAt: v.salesStartsAt, salesEndsAt: v.salesEndsAt, ticketPrice: v.ticketPrice, weeklyLimit: v.weeklyLimit,
    purchasedCount: v.purchasedCount, remainingCount: v.remainingCount, balance: v.balance,
    reservedBalance: v.reservedBalance, availableBalance: v.availableBalance, tickets }
}

export function parsePurchase(v: unknown): RafflePurchase {
  if (!record(v) || !positive(v.ticketId) || !positive(v.roundId) || !number(v.ticketNumber) || !positive(v.purchasePrice)
    || !time(v.purchasedAt) || !integer(v.balanceAfter) || !positive(v.purchasedCount) || !integer(v.remainingCount)) return invalid()
  return { ticketId: v.ticketId, roundId: v.roundId, ticketNumber: v.ticketNumber, purchasePrice: v.purchasePrice,
    purchasedAt: v.purchasedAt, balanceAfter: v.balanceAfter, purchasedCount: v.purchasedCount, remainingCount: v.remainingCount }
}

/** 판의 240칸은 연출용이다. 내 번호마다 한 칸을 비우며, 겹치면 다음 빈칸을 쓴다. */
export function ticketCells(numbers: readonly number[]) {
  const used = new Set<number>()
  return numbers.map(n => {
    let cell = (n - 1) % BOARD_CELLS
    while (used.has(cell)) cell = (cell + 1) % BOARD_CELLS
    used.add(cell)
    return cell
  })
}

export type DrawBlock = 'scheduled' | 'closed' | 'limit' | 'balance' | null
/** 화면 안내용 판정이다. 최종 판정은 구매 API가 한다. */
export function drawBlock(data: RaffleCurrent, now = Date.now()): DrawBlock {
  if (data.salesStatus === 'SCHEDULED' || now < Date.parse(data.salesStartsAt)) return 'scheduled'
  if (data.salesStatus !== 'OPEN' || now >= Date.parse(data.salesEndsAt)) return 'closed'
  if (data.remainingCount <= 0) return 'limit'
  if (data.availableBalance < data.ticketPrice) return 'balance'
  return null
}

const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const formatKst = (ms: number) => kst.format(ms)
/** 판매 마감(다음 월요일 00:00 KST)에 추첨하고 같은 날 09:00에 발표한다. */
export function schedule(data: Pick<RaffleCurrent, 'salesStartsAt' | 'salesEndsAt'>) {
  const ends = Date.parse(data.salesEndsAt)
  return { opens: Date.parse(data.salesStartsAt), lastSale: ends - 60_000, draw: ends, announce: ends + 9 * 3_600_000 }
}

/** 2026-11-19 탑골공원 공개 추첨행사 회차. 이 회차만 주간 일정 대신 행사 일정을 보여 준다. */
export const LIVE_EVENT_WEEK = '2026-11-16'
export interface LiveEventSchedule { sales: string; announce: string; revealNotice: string; limitHint: string }
/**
 * 일회성 예외 일정. 11/09·11/16 회차 응모권은 서버가 함께 추첨하며, 화면에는 하나의 판매 기간으로 안내한다.
 * 발표 시각은 정하지 않았으므로 시각을 쓰지 않는다. 구매 가능 판단(drawBlock)은 서버 값을 그대로 쓴다.
 */
export function liveEventSchedule(data: Pick<RaffleCurrent, 'weekStartDate'>): LiveEventSchedule | null {
  if (data.weekStartDate !== LIVE_EVENT_WEEK) return null
  return {
    sales: '11월 9일(월) ~ 11월 18일(수) 23:59',
    announce: '11월 19일(목) 오후 탑골공원에서 공개 추첨행사',
    revealNotice: '11월 19일(목) 오후 탑골공원 공개 추첨행사에서 당첨 번호를 발표해요.',
    limitHint: '이번 주 뽑기권을 모두 뽑았어요. 11월 19일(목) 오후 공개 추첨행사를 기다려 주세요!',
  }
}
