import { beforeEach, expect, it } from 'vitest'
import { parseInventory, parseMachine, parseState } from '../../src/features/gacha/contracts'
import { acceptGacha, resetGachaEvents, useGachaEvents } from '../../src/features/gacha/events'
import { parseParkRanking, rankingColumns } from '../../src/features/rankingBoard/service'

const initial = [1, 2, 4, 8, 15], prices = [1000, 500, 250, 100, 20]
const machine = (version = 1, roundId = '1') => ({ roundId, version, remaining: 30,
  prizes: initial.map((remaining, i) => ({ grade: i + 1, initial: remaining, remaining, value: prices[i] })) })
const inventory = { tickets: 1, balance: 900, availableBalance: 800, boxes: [1, 2, 3, 4].map(grade => ({ grade, quantity: 0 })) }
beforeEach(resetGachaEvents)
it('잔여 칸과 합계가 일치해야 승인된 기계로 취급한다', () => {
  expect(parseMachine(machine()).remaining).toBe(30)
  expect(() => parseMachine({ ...machine(), remaining: 29 })).toThrow()
  expect(() => parseMachine({ ...machine(), version: -1 })).toThrow()
})
it('보관함 수량·가용 잔액·등급을 검증한다', () => {
  expect(parseInventory(inventory).availableBalance).toBe(800)
  expect(() => parseInventory({ ...inventory, availableBalance: 901 })).toThrow()
  expect(() => parseInventory({ ...inventory, boxes: [{ grade: 1, quantity: -1 }] })).toThrow()
  expect(parseState({ enabled: true, ticketPrice: 100, machine: machine(), inventory, products: [] }).ticketPrice).toBe(100)
})
it('새 회차를 승인하고 같은 1등 공지를 중복 표시하지 않는다', () => {
  const event = { eventId: 'aa7baf0b-0246-4391-adef-a247f90ac50a', machine: machine(2, '2'),
    winner: { userId: '42', nickname: '당첨자', winningRoundId: '1' } }
  acceptGacha(event, 100); acceptGacha(event, 200)
  expect(useGachaEvents.getState().machine?.roundId).toBe('2')
  expect(useGachaEvents.getState().notices).toHaveLength(1)
  expect(useGachaEvents.getState().notices[0]?.text).toContain('S급 캡슐')
  acceptGacha({ ...event, eventId: 'bb7baf0b-0246-4391-adef-a247f90ac50a', machine: machine(1) }, 300)
  expect(useGachaEvents.getState().machine?.roundId).toBe('2')
})
it('재고가 없는 새 접속 스냅샷은 과거 당첨 공지를 만들지 않는다', () => {
  acceptGacha({ eventId: 'aa7baf0b-0246-4391-adef-a247f90ac50a', machine: machine(), winner: null }, 0)
  expect(useGachaEvents.getState().notices).toEqual([])
})
it('실제 엽전을 유지하면서 총자산을 표시하고 잘못된 합계는 거절한다', () => {
  const snapshot = { balance: [{ rank: 1, userId: '42', nickname: '테스트', coinBalance: 100, equipmentValue: 1000, totalAssets: 1100 }],
    mole: [], speedMole: [], updatedAt: '2026-11-06T00:00:00Z' }
  const parsed = parseParkRanking(snapshot)
  expect(parsed.balance[0]?.coinBalance).toBe(100)
  expect(rankingColumns(parsed)[0]?.rows[0]?.value).toBe('1,100냥')
  expect(rankingColumns(parsed)[0]?.title).toBe('총자산')
  expect(() => parseParkRanking({ ...snapshot, balance: [{ ...snapshot.balance[0], totalAssets: 9999 }] })).toThrow()
})
it('캡슐 미리보기는 그 등급에서 받을 수 있는 세트를 모두 보여 준다', async () => {
  const { gradeProductNames } = await import('../../src/features/gacha/labels')
  const p = (name: string, grade: number, compatibility: string) => ({ name, grade, compatibility })
  const products = [p('양반 세트', 2, 'MALE'), p('양반 세트', 2, 'FEMALE'), p('사또 세트', 2, 'MALE'), p('상어 세트', 2, 'ANY'),
    p('장군 세트', 1, 'MALE'), p('SSAFY 검정 세트', 4, 'FEMALE')]
  expect(gradeProductNames(products, 2, 'MALE')).toEqual(['양반', '사또', '상어'])
  expect(gradeProductNames(products, 2, 'FEMALE')).toEqual(['양반', '상어'])
  expect(gradeProductNames(products, 4, 'MALE')).toEqual([])
})
