import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { walletBalance } from '../wallet/balance'
import { useWalletSettlement } from '../wallet/settlementRefresh'
import type { StartState } from '../../game/protocol'
import './readyBalance.css'

export function availableForBet(value: unknown): number {
  walletBalance(value);
  return (value as { availableBalance: number }).availableBalance
}
export function startFailureNotice(start: StartState | null): string {
  return start?.phase === 'WAITING' && start.code === 'INSUFFICIENT_BALANCE'
    ? '참가자의 사용 가능 잔액이 부족해 시작하지 못했어요. 준비가 해제됐으니 잔액과 판돈을 확인해주세요.'
    : start?.phase === 'WAITING' && start.code === 'START_REJECTED'
      ? '경기를 시작하지 못해 준비를 해제했어요. 참가 상태와 판돈을 확인해주세요.' : ''
}
export type ReadyBalance = { status: 'loading' | 'ready' | 'error'; available: number | null }
export const canAffordBet = (balance: ReadyBalance, bet: number | null | undefined) =>
  balance.status === 'ready' && balance.available !== null && bet != null
  && Number.isSafeInteger(bet) && bet >= 0 && balance.available >= bet

/** Read-only UI hint. READY_SET and DB reservation independently validate the balance. */
export function useReadyBalance(active: boolean, scope: string, startRevision = 0) {
  const runtime = useParkRuntime(), owner = useSession(s => s.sessionId)
  const total = useSession(s => s.account?.balance), connected = useSession(s => s.status === 'connected')
  const revision = useWalletSettlement(s => s.owner === owner ? s.revision : 0)
  const [state, setState] = useState<ReadyBalance & { owner: string }>({owner:'',status:'loading',available:null})
  const pending = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    pending.current?.abort()
    if (!active || !connected || !owner) return
    const abort = new AbortController(); pending.current = abort
    setState({owner,status:'loading',available:null})
    try {
      const available = availableForBet(await runtime.requestJSON('/api/v1/wallets/me', {
        cache:'no-store', signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)]),
      }))
      if (!abort.signal.aborted && pending.current === abort) setState({owner,status:'ready',available})
    } catch {
      if (!abort.signal.aborted && pending.current === abort) setState({owner,status:'error',available:null})
    }
  }, [runtime,owner,active,connected,scope,total,revision,startRevision])
  useEffect(() => {
    void refresh()
    const focus = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
    return () => {pending.current?.abort();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
  }, [refresh])
  return {balance: state.owner === owner ? state : {status:'loading' as const,available:null},refresh}
}

export function BetBalanceNotice({balance,bet,retry}:{balance:ReadyBalance;bet:number|null|undefined;retry:()=>unknown}) {
  const shortage = bet != null && balance.available !== null ? Math.max(0,bet-balance.available) : 0
  return <div className="ready-balance-notice" role="status" aria-live="polite" data-shortage={shortage>0}>
    {balance.status === 'loading' ? '사용 가능 잔액을 확인하고 있어요…' : balance.status === 'error'
      ? <>잔액을 확인하지 못해 준비할 수 없어요. <button type="button" onClick={()=>void retry()}>잔액 다시 확인</button></>
      : <>사용 가능 {balance.available?.toLocaleString('ko-KR')}냥{shortage>0 && <strong> · {shortage.toLocaleString('ko-KR')}냥 부족해요</strong>}</>}
  </div>
}
