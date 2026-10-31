import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, expect, it, vi } from 'vitest'
vi.stubEnv('VITE_PARK_MAP', 'generated'); vi.stubEnv('MODE', 'park-integration'); vi.resetModules()
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
const { useJumpmap } = await import('../../src/features/jumpmap/state')
const { COURSE } = await import('../../src/features/jumpmap/course')
afterAll(() => { vi.unstubAllEnvs(); useJumpmap.setState({ available: false }) })

/**
 * 실제 FE 예측 물리(Rapier, PARK_V1, 점프맵 활성)가 만든 60Hz 궤적. BE FePredictionTrajectoryValidationTests가
 * 같은 파일을 DEV 위치 검증기에 보고해 정상 FE 이동이 거절되지 않는지 확인한다. 예측 물리를 바꾸면
 * `JUMPMAP_TRAJECTORY_UPDATE=1`로 다시 만든다.
 */
const FIXTURE = new URL('../fixtures/jumpmapPredictionTrajectories.json', import.meta.url)
type Point = { x: number; y: number; z: number }
type Intent = { dx: number; dz: number; run: boolean; jump: boolean }

async function run(name: string, start: Point, plan: (i: number, p: Point) => Intent | null) {
  const sim = await createPredictionPhysics('PARK_V1')
  const frames: number[][] = []
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  try {
    sim.reset({ ...start, yaw: 0 }, 0, false)
    for (let i = 0; i < 60; i++) sim.step({ dx: 0, dz: 0, run: false, jump: false }, 1 / 60)
    const push = (p: Point, jump: boolean) => frames.push([round(p.x), round(p.y), round(p.z), jump ? 1 : 0])
    push(sim.pose(), false)
    for (let i = 0; i < 900; i++) {
      const input = plan(i, sim.pose()); if (!input) break
      sim.step(input, 1 / 60); push(sim.pose(), input.jump)
    }
  } finally { sim.dispose() }
  return { name, frames }
}

/** 다음 발판 중심으로 가다 평면 2.6m 안에서 서 있을 때 뛰고, 목표 위에서는 감속한다. */
function hops(blocks: number[], offset = 0) {
  let target = 0, frames = 0, wait = 0, lastY = NaN, jumped = false, settle = 0
  return (_: number, p: Point): Intent | null => {
    if (target >= blocks.length) return wait++ < 30 ? { dx: 0, dz: 0, run: false, jump: false } : null
    const b = COURSE[blocks[target]!]!, dx = b.x + offset - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz)
    const still = Number.isFinite(lastY) && Math.abs(p.y - lastY) < 1e-4
    lastY = p.y
    if (Math.abs(p.y - .8 - b.top) < .15 && d < Math.max(b.halfX, b.halfZ) && still) {
      if (++settle > 6) { target++; frames = 0; jumped = false; settle = 0 }
      return { dx: 0, dz: 0, run: false, jump: false }
    }
    settle = 0
    if (++frames > 150 || p.y < b.top - 4) return null
    const jump = !jumped && still && d < 2.6
    if (jump) jumped = true
    const scale = jumped ? Math.min(1, d / 1.2) : 1
    return { dx: d > .05 ? dx / d * scale : 0, dz: d > .05 ? dz / d * scale : 0, run: true, jump }
  }
}

async function generate() {
  const above = (b: number, dy = 1) => ({ x: COURSE[b]!.x, y: COURSE[b]!.top + .8 + dy, z: COURSE[b]!.z })
  const out = [
    await run('flat-walk-jump', { x: 10, y: 1.5, z: 70 }, i => i < 120 ? { dx: 1, dz: 0, run: i > 40, jump: i === 20 || i === 70 } : null),
    await run('court-to-pad0', { x: -53, y: 1.2, z: -14.1 }, hops([0])),
    await run('stone-climb', above(0), hops([1, 2, 3, 4, 5, 6])),
    await run('kite-hops', above(80), hops([81, 82])),
    await run('cylinder-hops', above(25), hops([26, 27])),
    await run('pad-edge-hop', above(0), hops([1], .6)),
    await run('fast-fall-kite', above(85, 20), i => i < 120 ? { dx: 0, dz: 0, run: false, jump: false } : null),
    await run('buffered-hops', above(2), i => i < 150 ? { dx: 0, dz: 0, run: false, jump: i % 40 === 0 || i % 40 === 36 } : null),
  ]
  // 발판 가장자리에서 걸어 내려가기(보고 위상에 따라 기존 직선 검사가 떠나는 모서리를 충돌로 보던 경로).
  for (const block of [0, 26, 40, 85, 100]) for (let k = 0; k < 8; k += 2) {
    const b = COURSE[block]!, a = k * Math.PI / 4
    out.push(await run(`walkoff-${block}-${k}`, { x: b.x, y: b.top + 1.3, z: b.z },
      i => i < 50 ? { dx: Math.cos(a), dz: Math.sin(a), run: k % 4 === 0, jump: false } : null))
  }
  return out
}

it('keeps the FE prediction trajectories used by the BE position validator test', async () => {
  useJumpmap.setState({ available: true })
  const generated = await generate()
  if (process.env.JUMPMAP_TRAJECTORY_UPDATE === '1') writeFileSync(FIXTURE, JSON.stringify(generated) + '\n')
  const stored = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof generated
  expect(stored.map(s => [s.name, s.frames.length])).toEqual(generated.map(s => [s.name, s.frames.length]))
  stored.forEach((s, i) => s.frames.forEach((f, j) => f.forEach((v, k) => expect(v).toBeCloseTo(generated[i]!.frames[j]![k]!, 3))))
  // 서 있는 높이는 FE 기준 윗면 + 0.80m다(BE Bullet은 약 +0.74m).
  const start = stored.find(s => s.name === 'stone-climb')!.frames[0]!
  expect(start[1]! - COURSE[0]!.top).toBeCloseTo(.8, 3)
}, 120000)
