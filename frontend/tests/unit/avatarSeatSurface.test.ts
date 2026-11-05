import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('avatar seat contact follows the selected map', () => {
  it('preserves the legacy slatted and pavilion seat heights', async () => {
    vi.stubEnv('MODE', 'test'); vi.stubEnv('VITE_PARK_MAP', '')
    const { avatarSeatSurface } = await import('../../src/world/avatarMotion')
    const { BENCH_PAVILIONS } = await import('../../src/config')
    for (const [i, pavilion] of BENCH_PAVILIONS.entries())
      expect(avatarSeatSurface(`bench-${i}`)).toBe(pavilion ? .56 : .58)
  })

  it('matches every generated bench to its physical seat top, including low decks and fitness rings', async () => {
    vi.stubEnv('MODE', 'park-integration'); vi.stubEnv('VITE_PARK_MAP', 'generated')
    const { avatarSeatSurface } = await import('../../src/world/avatarMotion')
    const { PARK_DATA } = await import('../../src/map/park')
    const heights = new Set<number>()
    for (const bench of PARK_DATA.interactions.benches) {
      const top = bench.id.startsWith('bench-fitness-ring-') ? .62
        : (() => {
          const box = PARK_DATA.physics.boxes.find(b => b.id === `${bench.id}-seat`)
          expect(box, bench.id).toBeDefined()
          return box!.center[1] + box!.half[1] - bench.position[1]
        })()
      expect(avatarSeatSurface(bench.id), bench.id).toBeCloseTo(top, 6)
      heights.add(Number(top.toFixed(2)))
    }
    expect([...heights]).toEqual(expect.arrayContaining([.46, .56, .57, .62]))
  })

  it('retains the table height for an empty or unknown bench identifier', async () => {
    const { avatarSeatSurface } = await import('../../src/world/avatarMotion')
    expect(avatarSeatSurface('')).toBe(.56)
    expect(avatarSeatSurface('unknown-bench')).toBe(.56)
  })
})
