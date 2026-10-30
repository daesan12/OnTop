import { afterAll, expect, it, vi } from 'vitest'
vi.stubEnv('VITE_PARK_MAP', 'generated'); vi.stubEnv('MODE', 'park-integration'); vi.resetModules()
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
const { useJumpmap } = await import('../../src/features/jumpmap/state')
const { COURSE } = await import('../../src/features/jumpmap/course')
afterAll(() => { vi.unstubAllEnvs(); useJumpmap.setState({ available: false }) })
it('catches a 20 m/s fall on the existing 5 cm kite and removes colliders when disabled', async () => {
  const sim = await createPredictionPhysics(), pad = COURSE.find(p => p.theme === 'kite')!
  const stop = { dx: 0, dz: 0, run: false, jump: false }
  try {
    useJumpmap.setState({ available: true })
    sim.reset({ x: pad.x, y: pad.top + 2 + .8, z: pad.z, yaw: 0 }, -20, false)
    for (let i = 0; i < 30; i++) sim.step(stop, 1 / 60)
    expect(sim.pose().y - .8).toBeCloseTo(pad.top, 1)
    useJumpmap.setState({ available: false })
    for (let i = 0; i < 45; i++) sim.step(stop, 1 / 60)
    expect(sim.pose().y).toBeLessThan(pad.top - 2)
  } finally { sim.dispose() }
})
