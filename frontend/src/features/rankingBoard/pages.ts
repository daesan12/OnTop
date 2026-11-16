import { create } from 'zustand'

export const RANKING_PAGE_MS = 8_000
export const RANKING_PAGE_COUNT = 2
export const useRankingPages = create<{ boardPage: number; detailPage: number; deadline: number | null }>(() => ({
  boardPage: 0, detailPage: 0, deadline: null,
}))
export const rankingPage = <T,>(columns: readonly T[], page: number) => columns.slice(page * 4, page * 4 + 4)
export function selectDetailPage(page: number) {
  useRankingPages.setState({ detailPage: (page + RANKING_PAGE_COUNT) % RANKING_PAGE_COUNT })
}
export function advanceRankingPage(now: number) {
  useRankingPages.setState(s => ({ boardPage: (s.boardPage + 1) % RANKING_PAGE_COUNT, deadline: now + RANKING_PAGE_MS }))
}
