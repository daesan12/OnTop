import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../config'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from './runtime/ParkRuntime'
import { GraphicsSettings } from '../performance/GraphicsSettings'
import { GamePanel } from '../game/GamePanel'
import { TableLobby } from '../features/tableLobby/TableLobby'

export function ParkTools({
  quality,
  onQuality,
}: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  const runtime = useParkRuntime()
  const state = useSession(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      roomId: s.roomId,
      focusedAnchorId: s.focusedAnchorId,
      tableId: s.tableId,
      bindings: s.bindings,
    })),
  )
  return (
    <>
      <div className="park-runtime-tools">
        {state.tableId && !state.focusedAnchorId && <button onClick={() => {
          const binding = state.bindings.find(b => b.channelId === state.roomId && b.tableId === state.tableId)
          if (binding) runtime.inspectTable(binding.anchorId)
        }}>테이블 로비 열기</button>}
        <GraphicsSettings quality={quality} onQuality={onQuality} />
      </div>
      <TableLobby />
      <GamePanel />
      {(state.error ||
        state.status === 'joining' ||
        state.status === 'reconnecting') && (
        <div
          className="park-runtime-status"
          role={state.error ? 'alert' : 'status'}
        >
          {state.error ||
            (state.status === 'joining'
              ? '공원 서버 연결 중…'
              : '다시 연결하고 있어요…')}
          {state.status === 'error' && (
            <button onClick={runtime.reconnect}>다시 연결</button>
          )}
        </div>
      )}
    </>
  )
}
