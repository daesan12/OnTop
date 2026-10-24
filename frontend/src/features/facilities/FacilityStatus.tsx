import { useShallow } from 'zustand/react/shallow'
import { parkRuntime } from '../../park/runtime/runtime'
import { serverFacilities, useFacilityState } from './state'

export function FacilityStatus() {
  const s = useFacilityState(useShallow(s => ({ loading: s.loading, ready: s.ready, channelId: s.channelId,
    error: s.error, uncertain: s.uncertain, awaitingWorld: s.awaitingWorld })))
  if (!serverFacilities || !s.channelId || (s.ready && !s.error && !s.uncertain && !s.awaitingWorld)) return null
  return <aside className="park-runtime-panel facility-status" aria-label="시설 연결 상태">
    <p role="status">{s.loading ? '시설 목록과 점유를 확인하고 있어요.' : s.awaitingWorld
      ? '이용 상태를 확인했어요. 서버 승인 위치를 기다리고 있어요.' : s.error || '시설 점유를 다시 확인해주세요.'}</p>
    {!s.loading && <button onClick={() => void parkRuntime.checkFacilities().catch(() => {})}>시설 상태 다시 확인</button>}
    {(s.uncertain || s.awaitingWorld) && <button onClick={() => parkRuntime.reconnect()}>다시 연결</button>}
  </aside>
}
