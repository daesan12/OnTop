import { useSession } from '../../network/worldClient'
import { spendableBalance } from './balance'
import { useWalletSyncStatus } from './syncStatus'
import './wallet.css'

/** 표시 전용. 조회와 재시도는 공원 루트의 useWalletSync가 담당한다. */
export function WalletBalance() {
  const owner = useSession(s => s.sessionId)
  const balance = useSession(s => spendableBalance(s.account))
  const reserved = useSession(s => s.account?.reservedBalance ?? 0)
  const loading = useWalletSyncStatus(s => s.owner === owner && s.loading)
  const error = useWalletSyncStatus(s => s.owner === owner ? s.error : null)
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
