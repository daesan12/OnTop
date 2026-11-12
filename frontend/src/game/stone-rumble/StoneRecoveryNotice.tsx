import { recoveryBlocked, useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'

/** 복구 확인이 실패해도 결과 화면에서 다시 확인할 수 있는 경로를 남긴다. */
export function StoneRecoveryNotice() {
  const blocked = useGame(recoveryBlocked), pending = useSession(state => state.pending)
  const connected = useSession(state => state.status === 'connected'), runtime = useParkRuntime()
  if (!blocked) return null
  return <p role="status">경기 상태를 다시 확인해 주세요.{' '}
    <button className="paper-text-button" disabled={pending || !connected} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>
  </p>
}
