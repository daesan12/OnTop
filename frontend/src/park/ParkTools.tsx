import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from './runtime/ParkRuntime'
import { GraphicsSettings } from '../performance/GraphicsSettings'
import { GamePanel } from '../game/GamePanel'
import { TableLobby } from '../features/tableLobby/TableLobby'
import { TABLET_ENABLED } from '../features/tableLobby/tabletFeature'
import { useFacilityUseNotice } from '../features/facilities/state'

export function ParkTools() {
  const runtime = useParkRuntime()
  const state = useSession(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      roomId: s.roomId,
      focusedAnchorId: s.focusedAnchorId,
      tableId: s.tableId,
      bindings: s.bindings,
      mapContractStatus: s.mapContractStatus,
    })),
  )
  const facilityNotice = useFacilityUseNotice(s => s.message)
  const error = state.error || facilityNotice
  return (
    <>
      <div className="park-runtime-tools">
        {!TABLET_ENABLED && state.tableId && !state.focusedAnchorId && <button onClick={() => {
          const binding = state.bindings.find(b => b.channelId === state.roomId && b.tableId === state.tableId)
          if (binding) runtime.inspectTable(binding.anchorId)
        }}>테이블 로비 열기</button>}
        <GraphicsSettings />
      </div>
      <TableLobby />
      <GamePanel />
      {(error ||
        state.status === 'joining' ||
        state.status === 'reconnecting') && (
        <div
          className="park-runtime-status"
          role={error ? 'alert' : 'status'}
        >
          {error ||
            (state.status === 'joining'
              ? '공원 서버 연결 중…'
              : '다시 연결하고 있어요…')}
          {state.status === 'error' && (
            <>
              {state.mapContractStatus === 'mismatch' && <button onClick={() => window.location.reload()}>페이지 새로고침</button>}
              <button onClick={runtime.reconnect}>다시 연결</button>
            </>
          )}
        </div>
      )}
    </>
  )
}
