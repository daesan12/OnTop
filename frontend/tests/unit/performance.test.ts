import { afterEach, expect, it } from 'vitest'
import { metrics, recordFrame, resetMetrics, summarizeFrames } from '../../src/performance/metrics'
import { effectiveDpr } from '../../src/config/quality'
import { ResolutionBudget } from '../../src/performance/resolutionBudget'

afterEach(resetMetrics)
it('reports recent frame distribution separately from cumulative slow frames', () => {
  resetMetrics()
  for (let i = 0; i < 20; i++) recordFrame(60)
  for (let i = 0; i < 600; i++) recordFrame(10)
  expect(summarizeFrames()).toMatchObject({ fps: 100, p95: 10, p99: 10, max: 10, frames: 620, slowFrames: 20 })
})
it('reset removes old quality samples while preserving current renderer dimensions/resources', () => {
  const before = { ...metrics }
  metrics.width = 1280; metrics.height = 720; metrics.drawCalls = 200; metrics.renderer = 'WebGL 2 test'
  recordFrame(100)
  const snapshot = summarizeFrames()
  resetMetrics()
  expect(summarizeFrames()).toMatchObject({ fps: 0, p95: 0, p99: 0, max: 0, frames: 0, slowFrames: 0, width: 1280, height: 720, drawCalls: 200, renderer: 'WebGL 2 test' })
  recordFrame(20)
  expect(summarizeFrames()).toMatchObject({ fps: 50, p95: 20, frames: 1 })
  expect(snapshot.max).toBe(100)
  Object.assign(metrics, before)
})
it('keeps current PC preset pixel ceilings and device DPR constraints', () => {
  expect(effectiveDpr('low', 1920, 1080, 2)).toBeCloseTo(2 / 3)
  expect(effectiveDpr('medium', 1920, 1080, 2)).toBeCloseTo(5 / 6)
  expect(effectiveDpr('high', 1920, 1080, 2)).toBe(1)
  expect(effectiveDpr('high', 1280, 720, 0.75)).toBe(0.75)
})
it('adapts only after sustained windows, ignores hidden-tab gaps, and never exceeds the preset', () => {
  const budget = new ResolutionBudget()
  for (const delta of [0, -1, Infinity, NaN, 60]) expect(budget.advance(delta)).toBe(false)
  for (let i = 0; i < 100; i++) budget.advance(0.04)
  expect(budget.scale).toBe(1)
  for (let i = 0; i < 400; i++) budget.advance(0.04)
  expect(budget.scale).toBe(0.75)
  for (let i = 0; i < 16000; i++) budget.advance(0.01)
  expect(budget.scale).toBe(1)
})
