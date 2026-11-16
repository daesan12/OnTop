import { useEffect } from 'react'
import { advanceRankingPage, RANKING_PAGE_MS, useRankingPages } from './pages'

export function useRankingPageCycle(open: boolean) {
  useEffect(() => {
    let timer: number | undefined
    const restart = () => {
      window.clearInterval(timer)
      useRankingPages.setState({ deadline: null })
      if (open || document.visibilityState !== 'visible') return
      useRankingPages.setState({ deadline: performance.now() + RANKING_PAGE_MS })
      timer = window.setInterval(() => advanceRankingPage(performance.now()), RANKING_PAGE_MS)
    }
    restart()
    document.addEventListener('visibilitychange', restart)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', restart); useRankingPages.setState({ deadline: null }) }
  }, [open])
}
