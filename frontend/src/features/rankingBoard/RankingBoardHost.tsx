import { useCallback, useEffect, useRef } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { RankingBoardDialog } from './RankingBoardDialog'
import { fetchParkRanking, parkRankingError } from './service'
import { beginRankingRefresh, completeRankingRefresh, failRankingRefresh } from './state'
import { useRankingBoardEntry } from './model'
import { useRankingPageCycle } from './pageCycle'

const POLL_INTERVAL_MS = 15_000
export const canPollParkRanking = (visibility: DocumentVisibilityState) => visibility === 'visible'

export function RankingBoardHost() {
  const runtime = useParkRuntime()
  const open = useRankingBoardEntry(state => state.open)
  const inFlight = useRef<AbortController | null>(null)
  const refresh = useCallback(() => {
    if (!canPollParkRanking(document.visibilityState) || inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    beginRankingRefresh()
    void fetchParkRanking(runtime.requestJSON, controller.signal)
      .then(completeRankingRefresh)
      .catch(error => { if (!controller.signal.aborted) failRankingRefresh(parkRankingError(error)) })
      .finally(() => { if (inFlight.current === controller) inFlight.current = null })
  }, [runtime])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  useRankingPageCycle(open)

  useEffect(() => {
    // The provider starts the runtime in its own effect. Defer the first read by
    // one task so the allowlisted command port is active before polling begins.
    const first = window.setTimeout(refresh, 0)
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS)
    // Timer throttling alone is not a load-control policy. Hidden tabs skip
    // polling completely and catch up once when the user returns.
    const onVisibilityChange = () => { if (canPollParkRanking(document.visibilityState)) refresh() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [refresh])

  return <RankingBoardDialog refresh={refresh} />
}
