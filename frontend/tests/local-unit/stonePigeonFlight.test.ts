import { expect, it } from 'vitest'
import { sampleStonePigeon, StonePigeonFlights } from '../../src/game/stone-rumble/pigeonFlight'

const pigeon = { id: 1, owner: '101', x: 2, y: .8, z: 0, vx: 20, vz: 0, bornAt: 1000 }
const state = (serverTime: number, pigeons = [pigeon]) => ({ gameId: 'game', serverTime, startsAt: 1000, pigeons })
it('제거 패킷이 늦어도 최대 비행시간 뒤로 더 날아가며 사거리를 부풀리지 않는다', () => {
  const flights = new StonePigeonFlights(), point = { x: 0, y: 0, z: 0 }
  flights.accept(state(2100, [{ ...pigeon, x: 22 }]))
  flights.accept(state(2400, []))
  expect(sampleStonePigeon(flights.current[0]!, 2199, point)).toBe(true)
  expect(point.x).toBeCloseTo(23.98)
  expect(sampleStonePigeon(flights.current[0]!, 2200, point)).toBe(false)
})
it('100ms 패킷 간에도 비둘기는 부드럽게 이동하고 발사 전 시각으로 역주행하지 않는다', () => {
  const flights = new StonePigeonFlights(), point = { x: 0, y: 0, z: 0 }
  flights.accept(state(1100))
  expect(sampleStonePigeon(flights.current[0]!, 990, point)).toBe(false)
  for (const [time, x] of [[1000, 0], [1025, .5], [1050, 1], [1075, 1.5]]) {
    expect(sampleStonePigeon(flights.current[0]!, time!, point)).toBe(true)
    expect(point.x).toBeCloseTo(x!)
  }
})
it('발사와 명중이 같은 패킷 사이에 있어도 맞기 직전까지 그리고 판정 시각에 제거한다', () => {
  const flights = new StonePigeonFlights(), point = { x: 0, y: 0, z: 0 }
  flights.accept({ ...state(1100, []), impacts: [{ ...pigeon, x: 1.2, at: 1060, targetUserId: '202' }] })
  expect(sampleStonePigeon(flights.current[0]!, 1050, point)).toBe(true)
  expect(point.x).toBeCloseTo(1)
  expect(sampleStonePigeon(flights.current[0]!, 1060, point)).toBe(false)
})
it('제거 패킷은 표시 시각까지 보존하며 새 경기·복구에는 과거 비둘기를 남기지 않는다', () => {
  const flights = new StonePigeonFlights(), point = { x: 0, y: 0, z: 0 }
  flights.accept(state(1100)); flights.accept(state(1200, []))
  expect(sampleStonePigeon(flights.current[0]!, 1150, point)).toBe(true)
  expect(point.x).toBeCloseTo(3)
  flights.accept(state(1800, [])); expect(flights.current).toEqual([])
  flights.accept(state(1100)); flights.accept({ ...state(1200, []), gameId: 'next' })
  expect(flights.current).toEqual([])
})
