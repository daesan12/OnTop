import { useEffect } from 'react'
import { useGame } from '../../game/store'
import { useSession } from '../../network/worldClient'
import { RestError } from '../../network/restError'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { walletSnapshot } from './balance'
import { createWalletRefreshQueue } from './refreshQueue'
import { useWalletSettlement } from './settlementRefresh'
import { useWalletSyncStatus, type BalanceError } from './syncStatus'

const reservationKey = (s: ReturnType<typeof useGame.getState>) => s.start && !s.start.simulation
  ? JSON.stringify([s.start.tableId, s.start.startAttemptId, s.start.gameSessionId, s.start.phase]) : ''

/** ParkContent에서 한 번만 실행한다. 잔액 UI의 마운트 여부와 관계없이 동기화한다. */
export function useWalletSync() {
  const runtime = useParkRuntime()
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  useEffect(() => {
    useWalletSyncStatus.setState({ owner, loading: false, error: null })
    if (!owner || !connected) return
    let alive = true, balanceRevision = 0
    let abort: AbortController | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    const present = () => alive && useSession.getState().sessionId === owner && useSession.getState().status === 'connected'
    const queue = createWalletRefreshQueue(async fresh => {
      const session = useSession.getState()
      if (!present() || !session.account) return
      if (retry !== undefined) { clearTimeout(retry); retry = undefined }
      const reading = balanceRevision, controller = abort = new AbortController()
      useWalletSyncStatus.setState({ owner, loading: true, error: null })
      const current = () => present() && fresh() && !controller.signal.aborted && reading === balanceRevision
      try {
        const value = walletSnapshot(await runtime.requestJSON('/api/v1/wallets/me', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store',
        }))
        const account = useSession.getState().account
        if (current() && account) useSession.setState({ account: { ...account,
          balance: value.balance, reservedBalance: value.reservedBalance } })
      } catch (cause) {
        if (!current()) return
        const error: BalanceError = cause instanceof RestError && cause.code === 'WALLET_NOT_READY' ? 'not-ready'
          : cause instanceof RestError && cause.code === 'WALLET_UNAVAILABLE' ? 'unavailable' : 'failed'
        useWalletSyncStatus.setState({ error })
        retry = setTimeout(() => {
          retry = undefined
          if (!document.hidden && navigator.onLine !== false) queue.request()
        }, error === 'not-ready' ? 30000 : 5000)
      } finally {
        if (abort === controller) abort = null
        if (present()) useWalletSyncStatus.setState({ loading: false })
      }
    }, () => abort?.abort())
    const stops = [
      useGame.subscribe((next, previous) => { if (reservationKey(next) !== reservationKey(previous)) queue.request() }),
      useWalletSettlement.subscribe((next, previous) => {
        if (next.owner === owner && (next.owner !== previous.owner || next.revision !== previous.revision)) queue.request()
      }),
      useSession.subscribe((next, previous) => {
        if (!present()) return
        if (next.account?.balance !== previous.account?.balance || next.account?.reservedBalance !== previous.account?.reservedBalance) {
          balanceRevision++
          useWalletSyncStatus.setState({ error: null })
        }
        if (next.account && !previous.account) queue.request()
      }),
    ]
    const recheck = () => { if (!document.hidden) queue.request() }
    window.addEventListener('focus', recheck)
    window.addEventListener('ontop-gacha-committed', recheck)
    window.addEventListener('online', recheck)
    document.addEventListener('visibilitychange', recheck)
    queue.request()
    return () => {
      window.removeEventListener('ontop-gacha-committed', recheck)
      alive = false
      queue.dispose(); abort?.abort()
      if (retry !== undefined) clearTimeout(retry)
      stops.forEach(stop => stop())
      window.removeEventListener('focus', recheck)
      window.removeEventListener('online', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [runtime, owner, connected])
}
