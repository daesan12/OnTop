import { expect, it } from 'vitest'
import { closingTime } from '../../src/features/skewer/closingTime'

it('마감 안내는 화면에 표시하는 초 기준으로 60·30·10초 경계에 바뀐다', () => {
  expect(closingTime(60.1).phase).toBe('normal'); expect(closingTime(60).phase).toBe('warning')
  expect(closingTime(30.1).phase).toBe('warning'); expect(closingTime(30).phase).toBe('urgent')
  expect(closingTime(10.1).phase).toBe('urgent'); expect(closingTime(10).phase).toBe('critical')
  expect(closingTime(.1).phase).toBe('critical')
})
it('종료·잘못된 시간에는 마감 알림을 띄우지 않는다', () => {
  for (const value of [0, -1, Infinity, NaN]) expect(closingTime(value).message).toBe('')
})
