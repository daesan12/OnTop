import { afterEach, describe, expect, it } from 'vitest'
import { jumpmapXRView } from '../../src/features/jumpmap/xrModel'
import { useJumpmap, resetJumpmap } from '../../src/features/jumpmap/state'
import { parseJumpmapRankings } from '../../src/features/jumpmap/ranking'

afterEach(resetJumpmap)
describe('돌탑 VR 화면의 서버 상태 계약', () => {
  it('첫 발판 전에는 조작 안내만 표시하고 안내를 열어도 도전을 만들지 않는다', () => {
    const state = useJumpmap.getState()
    expect(jumpmapXRView(state, 1000, false).buttons).toEqual([])
    expect(jumpmapXRView(state, 1000, true).key).toBe('guide')
    expect(useJumpmap.getState().run).toBeNull()
    expect(useJumpmap.getState().walletRevision).toBe(0)
  })
  it('낙하와 완주를 구분하며 다른 판의 결과창을 표시하지 않는다', () => {
    const result = { runId: 'run1', elapsedMs: 10000, gatesPassed: 3, finalReached: false,
      maxHeight: 20, runCoins: 35, reason: 'FALL' as const, until: 20000 }
    useJumpmap.setState({ result, completion: null })
    expect(jumpmapXRView(useJumpmap.getState(), 15000, false).buttons).toEqual([])
    expect(jumpmapXRView(useJumpmap.getState(), 15000, false).lines[0]).toContain('다시 도전')
    useJumpmap.setState({ completion: { runId: 'old-run' } })
    expect(jumpmapXRView(useJumpmap.getState(), 15000, false).buttons).toEqual([])
  })
  it('서버의 완주 기록과 지급액을 표시하고 늦은 정산은 확인 중으로 구분한다', () => {
    useJumpmap.setState({ todayEarned: 100, completion: { runId: 'run1' }, bestFinishMs: 125400,
      result: { runId: 'run1', elapsedMs: 125400, gatesPassed: 7, finalReached: true,
        maxHeight: 46, runCoins: 100, reason: 'FINISH', until: 20000, finishMs: 125400 } })
    const view = jumpmapXRView(useJumpmap.getState(), 15000, false)
    expect(view.key).toBe('result:run1')
    expect(view.lines).toContain('완주 시간  2분 05.40초')
    expect(view.lines).toContain('이번 도전 받은 엽전  100냥')
    expect(view.lines.join()).toContain('일일 제한 없음')
    useJumpmap.setState({ todayEarned: 1000 })
    const capped = jumpmapXRView(useJumpmap.getState(), 15000, false)
    expect(capped.lines.join()).toContain('일일 제한 없음')
    useJumpmap.setState({ todayEarned: null })
    expect(jumpmapXRView(useJumpmap.getState(), 15000, false).lines.join()).toContain('확인하고')
    expect(capped.lines).toContain('이번 도전 받은 엽전  100냥')
  })
  it('랭킹은 기존 응답 검증을 공유하며 잘못된 지급·기록 형태를 화면에 넣지 않는다', () => {
    const entry = { rank: 1, userId: '101', nickname: '돌탑', finishMs: 125400, finishedAt: '2026-11-04T00:00:00Z' }
    expect(parseJumpmapRankings({ items: [entry], me: entry }).me).toEqual(entry)
    expect(() => parseJumpmapRankings({ items: [{ ...entry, finishMs: -1 }], me: null })).toThrow()
    expect(() => parseJumpmapRankings({ items: [], me: undefined })).toThrow()
  })
})
