import { expect, it } from 'vitest'
import { ENVIRONMENT } from '../../src/config/environment'
import { constellationNightIndex, constellations, selectConstellations } from '../../src/world/parkConstellations'

const dayMs = 86_400_000
const january = Date.UTC(2026, 0, 1)
const dayIndex = (month: number, day: number) => (Date.UTC(2026, month - 1, day) - january) / dayMs
const names = (nightIndex: number) => selectConstellations(nightIndex).visible.map(index => constellations[index]!.name)

it.each([
  [2, 28, '오리온자리'], [3, 1, '사자자리'], [6, 1, '백조자리'],
  [9, 1, '페가수스자리'], [12, 1, '오리온자리'],
] as const)('게임 날짜 %d월 %d일에는 계절 대표 별자리 %s가 보인다', (month, day, anchor) => {
  const visible = names(dayIndex(month, day))
  expect(visible).toHaveLength(5)
  expect(visible.slice(0, 3)).toEqual(['북두칠성', '카시오페이아자리', anchor])
})

it('같은 계절의 연속된 밤에도 대표 별자리를 중심으로 관측 대상이 달라진다', () => {
  const start = dayIndex(7, 1)
  const nights = [start, start + 1, start + 2].map(names)
  expect(new Set(nights.map(visible => visible.join(','))).size).toBe(3)
  expect(new Set(nights.flat())).toEqual(new Set(['북두칠성', '카시오페이아자리', '백조자리', '거문고자리', '독수리자리', '전갈자리']))
  expect(constellations).toHaveLength(18)
})

it('서버 시계상 자정을 지나도 새벽까지 전날 저녁의 별자리를 유지한다', () => {
  const config = { ...ENVIRONMENT, epochMs: 1000, dayDurationMs: 1_200_000 }
  const lastWinterNight = dayIndex(2, 28)
  const at = (fraction: number) => constellationNightIndex(config.epochMs + (lastWinterNight + fraction) * config.dayDurationMs, config)
  expect(at(.9)).toBe(lastWinterNight)
  expect(at(1.2)).toBe(lastWinterNight)
  expect(at(1.85)).toBe(lastWinterNight + 1)
  expect(names(at(1.2))).toContain('오리온자리')
  expect(names(at(1.85))).toContain('사자자리')
})
