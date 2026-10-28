import { expect, it } from 'vitest'
import { RewardFlightLedger, rewardCoinPose } from '../../src/features/wallet/rewardFlight'

it('claims a positive receipt once across remounts/reloads, scoped to its wallet owner', () => {
  const saved = new Map<string, string>(), storage = () => ({ getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) } })
  const ledger = new RewardFlightLedger(storage)
  expect(ledger.claim('101', 'board:g1', 12)).toBe(true)
  expect(ledger.claim('101', 'board:g1', 99)).toBe(false)
  expect(new RewardFlightLedger(storage).claim('101', 'board:g1', 12)).toBe(false)
  expect(ledger.claim('102', 'board:g1', 12)).toBe(true)
  expect(ledger.claim('101', 'board:g1', 12)).toBe(false)
  expect(ledger.claim('101', 'minigame:g1', 8)).toBe(true)
})
it('never celebrates zero, negative, missing or malformed awards and tolerates blocked storage', () => {
  const ledger = new RewardFlightLedger(() => { throw new Error('blocked storage') })
  for (const amount of [0, -12, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(ledger.claim('101', 'g', amount)).toBe(false)
  expect(ledger.claim('', 'g', 1)).toBe(false)
  expect(ledger.claim('101', '', 1)).toBe(false)
  expect(ledger.claim('101', 'g', 1)).toBe(true)
  expect(ledger.claim('101', 'g', 1)).toBe(false)
})
it('bounds persisted decorative receipts without storing amounts or a replacement wallet balance', () => {
  let saved = ''
  const ledger = new RewardFlightLedger(() => ({ getItem: () => 'corrupted-json', setItem: (_key, value) => { saved = value } }))
  for (let i = 0; i < 100; i++) ledger.claim('101', `board:${i}`, i + 1)
  expect(JSON.parse(saved)).toHaveLength(64)
  expect(JSON.parse(saved)).toEqual(Array.from({ length: 64 }, (_, i) => `board:${i + 36}`))
})
it('lands every staggered coin at the real destination and keeps long/negative frame gaps finite', () => {
  const from = { x: 300, y: 600 }, to = { x: 1150, y: 35 }
  for (let i = 0; i < 8; i++) {
    const landed = rewardCoinPose(from, to, 1600, i)
    expect(landed.x).toBe(to.x); expect(landed.y).toBe(to.y); expect(landed.opacity).toBe(0)
    for (const elapsed of [-100, 0, 100, 500, 50000]) {
      const pose = rewardCoinPose(from, to, elapsed, i)
      expect(Object.values(pose).every(Number.isFinite)).toBe(true)
      expect(pose.scale).toBeGreaterThan(0); expect(pose.opacity).toBeGreaterThanOrEqual(0)
    }
  }
})
