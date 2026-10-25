import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { RestError } from '../../network/restError'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { walletBalance } from './balance'
import './wallet.css'

type BalanceError = 'not-ready' | 'unavailable' | 'failed' | null

export function WalletBalance() {
  const runtime = useParkRuntime()
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  const balance = useSession(s => s.account?.balance ?? null)
  const [loading, setLoading] = useState(false), [error, setError] = useState<BalanceError>(null)
  const request = useRef({ id: 0, revision: 0, abort: null as AbortController | null })
  useEffect(() => useSession.subscribe((next, previous) => {
    if (next.account?.balance !== previous.account?.balance) {
      request.current.revision++
      setError(null)
    }
  }), [])
  const cancel = useCallback(() => { request.current.id++; request.current.abort?.abort() }, [])
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
      const value = walletBalance(await runtime.requestJSON('/api/v1/wallets/me', { signal: abort.signal, cache: 'no-store' }))
      if (!current()) return
      // A purchase/settlement may have already published a newer balance during this GET.
      const account = useSession.getState().account
      if (revision === request.current.revision && account) useSession.setState({ account: { ...account, balance: value } })
    } catch (cause) {
      if (!current() || revision !== request.current.revision) return
      setError(cause instanceof RestError && cause.code === 'WALLET_NOT_READY' ? 'not-ready'
        : cause instanceof RestError && cause.code === 'WALLET_UNAVAILABLE' ? 'unavailable' : 'failed')
    } finally {
      if (current()) setLoading(false)
    }
  }, [runtime, cancel])
  useEffect(() => {
    setLoading(false); setError(null)
    if (owner && connected) void refresh()
    return cancel
  }, [owner, connected, refresh, cancel])

  const unknown = loading ? '잔액 조회 중' : error === 'not-ready' ? '지갑 준비 필요' : error ? '잔액 조회 실패' : '잔액 미확인'
  const notice = error === 'not-ready' ? '아직 지갑이 준비되지 않았어요. 운영 담당자 확인 후 다시 조회해주세요.'
    : error === 'unavailable' ? '지갑 서비스에 연결하지 못했어요. 잠시 후 다시 조회해주세요.'
    : '잔액을 확인하지 못했어요. 잠시 후 다시 조회해주세요.'
  return <span className="park-wallet" aria-busy={loading}>
    <span className="park-account__balance" data-unknown={balance === null} aria-label="보유 엽전" aria-live="polite">
      {balance === null ? unknown : `${balance.toLocaleString('ko-KR')}냥`}
    </span>
    <button className="park-wallet__refresh" type="button" disabled={!connected || loading}
      aria-label="공원 잔액 다시 확인" title={loading ? '잔액 확인 중' : '잔액 다시 확인'} onClick={() => void refresh()}>
      <span aria-hidden="true">{loading ? '…' : '↻'}</span> 재조회
    </button>
    {error && <span className="park-wallet__notice" role="status">
      {balance !== null && '표시된 금액은 마지막 확인 잔액이에요. '}{notice}
    </span>}
  </span>
}
