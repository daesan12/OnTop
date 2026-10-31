import { create } from 'zustand'
import type { ParkRankingSnapshot } from './service'

interface RankingBoardFeedState {
  snapshot: ParkRankingSnapshot | null
  loading: boolean
  error: string
  stale: boolean
}

export const useRankingBoardFeed = create<RankingBoardFeedState>(() => ({
  snapshot: null,
  loading: false,
  error: '',
  stale: false,
}))

export function beginRankingRefresh() {
  const current = useRankingBoardFeed.getState()
  useRankingBoardFeed.setState({ loading: true, error: current.snapshot ? current.error : '', stale: current.stale })
}

export function completeRankingRefresh(snapshot: ParkRankingSnapshot) {
  const previous = useRankingBoardFeed.getState().snapshot
  useRankingBoardFeed.setState({
    snapshot: previous?.updatedAt === snapshot.updatedAt ? previous : snapshot,
    loading: false,
    error: '',
    stale: false,
  })
}

export function failRankingRefresh(error: string) {
  useRankingBoardFeed.setState(state => ({ loading: false, error, stale: state.snapshot !== null }))
}

export function resetRankingBoardFeed() {
  useRankingBoardFeed.setState({ snapshot: null, loading: false, error: '', stale: false })
}
