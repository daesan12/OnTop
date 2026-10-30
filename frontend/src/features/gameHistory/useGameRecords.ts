import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { appendHistory, fetchHistory, fetchStats, historyError, type GameHistoryPage, type GameStat, type RecordFilter } from './service'

interface Read<T> { key: string; data: T | null; loading: boolean; error: string }
const pending = <T,>(key: string): Read<T> => ({ key, data: null, loading: true, error: '' })
const ownsAccount = (owner: string) => {
  const current = useSession.getState()
  return !!owner && current.status === 'connected' && current.sessionId === owner
}

export function useGameRecords(filter: RecordFilter) {
  const runtime = useParkRuntime()
  const owner = useSession(s => s.status === 'connected' ? s.sessionId : '')
  const [historyRevision, setHistoryRevision] = useState(0), [statsRevision, setStatsRevision] = useState(0)
  const historyKey = `${owner}:${filter}:${historyRevision}`, statsKey = `${owner}:${statsRevision}`
  const [history, setHistory] = useState<Read<GameHistoryPage>>(() => pending(historyKey))
  const [stats, setStats] = useState<Read<GameStat[]>>(() => pending(statsKey))
  const historyScope = useRef<{ key: string; abort: AbortController; busy: boolean } | null>(null)

  useEffect(() => {
    const scope = { key: historyKey, abort: new AbortController(), busy: true }
    historyScope.current = scope
    setHistory(pending(historyKey))
    const current = () => historyScope.current === scope && !scope.abort.signal.aborted && ownsAccount(owner)
    // Skip the discarded StrictMode mount before dispatching an authenticated read.
    void Promise.resolve().then(async () => {
      if (!current()) return
      try {
        const data = await fetchHistory(runtime.requestJSON, filter, scope.abort.signal)
        if (current()) setHistory({ key: historyKey, data, loading: false, error: '' })
      } catch (error) {
        if (current()) setHistory({ key: historyKey, data: null, loading: false, error: historyError(error) })
      } finally { scope.busy = false }
    })
    return () => { scope.abort.abort(); if (historyScope.current === scope) historyScope.current = null }
  }, [runtime, owner, filter, historyKey])

  useEffect(() => {
    const abort = new AbortController()
    const current = () => !abort.signal.aborted && ownsAccount(owner)
    setStats(pending(statsKey))
    void Promise.resolve().then(async () => {
      if (!current()) return
      try {
        const data = await fetchStats(runtime.requestJSON, abort.signal)
        if (current()) setStats({ key: statsKey, data, loading: false, error: '' })
      } catch (error) {
        if (current()) setStats({ key: statsKey, data: null, loading: false, error: historyError(error) })
      }
    })
    return () => abort.abort()
  }, [runtime, owner, statsKey])

  const visibleHistory = history.key === historyKey ? history : pending<GameHistoryPage>(historyKey)
  const visibleStats = stats.key === statsKey ? stats : pending<GameStat[]>(statsKey)
  async function more() {
    const scope = historyScope.current, page = visibleHistory.data
    if (!scope || scope.key !== historyKey || scope.busy || !page?.nextCursor || !ownsAccount(owner)) return
    scope.busy = true
    setHistory({ key: historyKey, data: page, loading: true, error: '' })
    const current = () => historyScope.current === scope && !scope.abort.signal.aborted && ownsAccount(owner)
    try {
      const next = await fetchHistory(runtime.requestJSON, filter, scope.abort.signal, page.nextCursor)
      if (current()) setHistory({ key: historyKey, data: appendHistory(page, next), loading: false, error: '' })
    } catch (error) {
      if (current()) setHistory({ key: historyKey, data: page, loading: false, error: historyError(error) })
    } finally { scope.busy = false }
  }
  return { history: visibleHistory, stats: visibleStats, more,
    retryHistory: () => setHistoryRevision(value => value + 1), retryStats: () => setStatsRevision(value => value + 1),
    refresh: () => { setHistoryRevision(value => value + 1); setStatsRevision(value => value + 1) } }
}
