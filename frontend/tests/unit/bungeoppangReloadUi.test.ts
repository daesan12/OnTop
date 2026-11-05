import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../src/features/bungeoppang/store', async original => {
  const actual = await original<typeof import('../../src/features/bungeoppang/store')>()
  return { ...actual, useBungeoppang: Object.assign((selector?: (s: ReturnType<typeof actual.useBungeoppang.getState>) => unknown) =>
    selector ? selector(actual.useBungeoppang.getState()) : actual.useBungeoppang.getState(), actual.useBungeoppang) }
})
vi.mock('../../src/features/bungeoppang/BungeoppangRanking', () => ({
  useBungeoppangRanking: () => ({}), RankingDetails: () => null, RankingSummary: () => null,
}))
import { BungeoppangResult } from '../../src/features/bungeoppang/BungeoppangResult'
import { RecoveryPanel, BungeoppangRecoveryNotice } from '../../src/features/bungeoppang/BungeoppangHud'
import { useBungeoppang } from '../../src/features/bungeoppang/store'
afterEach(() => { useBungeoppang.setState({ phase: 'idle', grill: null, submitError: null, starting: false, abandonPending: false, startError: null }) })
it('renders a visible terminal explanation and park exit even when reload could not restore a grill', () => {
  useBungeoppang.setState({ phase: 'result', grill: null, submitError: { retryable: false, message: '이미 종료되거나 만료된 판이에요.' } })
  const html = renderToStaticMarkup(createElement(BungeoppangResult))
  expect(html).toContain('이미 종료되거나 만료된 판이에요.')
  expect(html).toContain('공원으로')
})
it('provides a park-view exit even before the failed lookup has identified a round', () => {
  useBungeoppang.setState({ phase: 'start', recovering: true, gameId: '', startError: '조회 실패' })
  const html = renderToStaticMarkup(createElement(RecoveryPanel))
  expect(html).toContain('공원 화면 보기')
  expect(html).toContain('다시 불러오기')
  expect(html).not.toContain('그만두고 공원으로')
})
it('keeps an honest activity warning and recovery action visible in the park', () => {
  const html = renderToStaticMarkup(createElement(BungeoppangRecoveryNotice))
  expect(html).toContain('진행 중인 판 확인 전에는 이동이 제한될 수 있어요.')
  expect(html).toContain('다시 불러오기')
})
