import type { QualityPreset } from '../../config/quality'
import { flushBehavior, logBehavior } from './client'
import { createPerfSampler } from './perfReport'
import { watchWelcomeTour } from './tourLog'

export const PERF_REPORT_INTERVAL_MS = 60_000

/** 공원에 있는 동안 1분마다 성능을 남기고 모인 로그를 보낸다. 탭을 숨기거나 떠날 때 남은 것을 keepalive로 보낸다. */
export function startBehaviorReporting(quality: QualityPreset) {
  const sample = createPerfSampler(quality)
  const stopTour = watchWelcomeTour()
  const timer = window.setInterval(() => {
    const props = sample()
    if (props) logBehavior({ type: 'PERF_REPORT', props })
    void flushBehavior()
  }, PERF_REPORT_INTERVAL_MS)
  const leave = () => void flushBehavior({ keepalive: true })
  const hidden = () => { if (document.visibilityState === 'hidden') leave() }
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('pagehide', leave)
  return () => {
    window.clearInterval(timer)
    stopTour()
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('pagehide', leave)
    leave()
  }
}
