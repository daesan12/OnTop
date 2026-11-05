import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../src/features/bungeoppang/store', async original => {
  const actual = await original<typeof import('../../src/features/bungeoppang/store')>()
  return { ...actual, useBungeoppang: Object.assign((selector: (s: ReturnType<typeof actual.useBungeoppang.getState>) => unknown) =>
    selector(actual.useBungeoppang.getState()), actual.useBungeoppang) }
})
vi.mock('../../src/features/bungeoppang/BungeoppangRanking', () => ({
  useBungeoppangRanking: () => ({}), RankingDetails: () => null, RankingSummary: () => null,
}))
import { BungeoppangResult } from '../../src/features/bungeoppang/BungeoppangResult'
import { useBungeoppang } from '../../src/features/bungeoppang/store'
afterEach(() => { useBungeoppang.setState({ phase: 'idle', grill: null, submitError: null }) })
it('renders a visible terminal explanation and park exit even when reload could not restore a grill', () => {
  useBungeoppang.setState({ phase: 'result', grill: null, submitError: { retryable: false, message: '이미 종료되거나 만료된 판이에요.' } })
  const html = renderToStaticMarkup(createElement(BungeoppangResult))
  expect(html).toContain('이미 종료되거나 만료된 판이에요.')
  expect(html).toContain('공원으로')
})
