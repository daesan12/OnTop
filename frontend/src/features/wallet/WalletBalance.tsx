import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { RestError } from '../../network/restError'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useGame } from '../../game/store'
import { spendableBalance, walletSnapshot } from './balance'
import { useWalletSettlement } from './settlementRefresh'
import './wallet.css'

type BalanceError = 'not-ready' | 'unavailable' | 'failed' | null

export function WalletBalance() {
  const runtime = useParkRuntime()
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  const balance = useSession(s => spendableBalance(s.account))
  const reserved = useSession(s => s.account?.reservedBalance ?? 0)
  const settlement = useWalletSettlement(s => s.owner === owner ? s.revision : 0)
  // 예약 커밋 이후 PLAYING, 예약 해제 이후 WAITING에도 서버 지갑을 다시 읽는다.
  const reservation = useGame(s => s.start && !s.start.simulation
    ? JSON.stringify([s.start.tableId, s.start.startAttemptId, s.start.gameSessionId, s.start.phase]) : '')
  const [loading, setLoading] = useState(false), [error, setError] = useState<BalanceError>(null)
  const request = useRef({ id: 0, revision: 0, abort: null as AbortController | null })
  useEffect(() => useSession.subscribe((next, previous) => {
    if (next.account?.balance !== previous.account?.balance || next.account?.reservedBalance !== previous.account?.reservedBalance) {
      request.current.revision++
      setError(null)
    }
  }), [])
  const cancel = useCallback(() => { request.current.id++; request.current.abort?.abort(); request.current.abort = null }, [])
  const refresh = useCallback(async () => {
    const session = useSession.getState()
    if (!session.sessionId || session.status !== 'connected' || !session.account) return
    cancel()
    const state = request.current, id = state.id, revision = state.revision
    const abort = state.abort = new AbortController()
    setLoading(true); setError(null)
    const current = () => !abort.signal.aborted && id === request.current.id
      && useSession.getState().sessionId === session.sessionId && useSession.getState().status === 'connected'
    try {
      const value = walletSnapshot(await runtime.requestJSON('/api/v1/wallets/me', {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]), cache: 'no-store',
      }))
      if (!current()) return
      // A purchase/settlement may have already published a newer balance during this GET.
      const account = useSession.getState().account
      if (revision === request.current.revision && account) useSession.setState({ account: { ...account,
        balance: value.balance, reservedBalance: value.reservedBalance } })
    } catch (cause) {
      if (!current() || revision !== request.current.revision) return
      setError(cause instanceof RestError && cause.code === 'WALLET_NOT_READY' ? 'not-ready'
        : cause instanceof RestError && cause.code === 'WALLET_UNAVAILABLE' ? 'unavailable' : 'failed')
    } finally {
      if (current()) { request.current.abort = null; setLoading(false) }
    }
  }, [runtime, cancel])
  useEffect(() => {
    setLoading(false); setError(null)
    if (owner && connected) void refresh()
    return cancel
  }, [owner, connected, settlement, reservation, refresh, cancel])
  useEffect(() => {
    if (!owner || !connected) return
    const recheck = () => {
      if (!document.hidden && !request.current.abort) void refresh()
    }
    window.addEventListener('focus', recheck)
    window.addEventListener('online', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      window.removeEventListener('online', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [owner, connected, refresh])
  useEffect(() => {
    if (!owner || !connected || !error) return
    // Read-only recovery replaces the manual retry button. Missing wallets are
    // checked less often; creating a wallet remains exclusively a server concern.
    const timer = setTimeout(() => {
      if (!document.hidden && navigator.onLine !== false && !request.current.abort) void refresh()
    }, error === 'not-ready' ? 30000 : 5000)
    return () => clearTimeout(timer)
  }, [owner, connected, error, refresh])

  const unknown = loading ? '잔액 조회 중' : error === 'not-ready' ? '지갑 준비 필요' : error ? '잔액 조회 실패' : '잔액 미확인'
  const notice = error === 'not-ready' ? '아직 지갑이 준비되지 않았어요. 운영 담당자 확인이 필요하며, 준비되면 자동으로 다시 확인해요.'
    : error === 'unavailable' ? '지갑 서비스에 연결하지 못했어요. 잠시 후 자동으로 다시 확인해요.'
    : '잔액을 확인하지 못했어요. 잠시 후 자동으로 다시 확인해요.'
  return <span className="park-wallet" aria-busy={loading}>
    <span className="park-account__balance" data-unknown={balance === null} aria-label="보유 엽전" aria-live="polite"
      title={reserved ? `판돈 ${reserved.toLocaleString('ko-KR')}냥 예약 중 · 사용 가능 잔액` : undefined}>
      {balance === null ? unknown : <>{balance.toLocaleString('ko-KR')}<i className="park-wallet__unit">냥</i></>}
    </span>
    {error && <span className="park-wallet__notice" role="status">
      {balance !== null && '표시된 금액은 마지막 확인 잔액이에요. '}{notice}
    </span>}
  </span>
}
