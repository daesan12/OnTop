import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../config'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from './runtime/ParkRuntime'
import { GraphicsSettings } from '../performance/GraphicsSettings'
import { GamePanel } from '../game/GamePanel'
import { TableLobby } from '../features/tableLobby/TableLobby'
import { useTelescopeState } from '../features/telescopes/state'

export function ParkTools({
  quality,
  onQuality,
}: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  const runtime = useParkRuntime()
  const ownId = useSession(s => s.sessionId)
  const telescopeBusy = useTelescopeState(s => s.pending || !!s.placements[ownId])
  const state = useSession(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      channels: s.channels,
      roomId: s.roomId,
      focusedAnchorId: s.focusedAnchorId,
      tableId: s.tableId,
      tables: s.tables,
      tableStates: s.tableStates,
      bindings: s.bindings,
      sessionId: s.sessionId,
      pending: s.pending,
      mapContractStatus: s.mapContractStatus,
    })),
  )
  const [channelOpen, setChannelOpen] = useState(false)
  useEffect(() => {
    const toggle = () => setChannelOpen((value) => !value)
    window.addEventListener('ontop-toggle-channels', toggle)
    return () => window.removeEventListener('ontop-toggle-channels', toggle)
  }, [])
  return (
    <>
      {(channelOpen || (!state.roomId && state.channels.length > 1)) && (
        <section
          className="park-runtime-panel park-channel-picker"
          aria-label="채널 선택"
        >
          <strong>채널 선택</strong>
          {state.channels.map((channel) => (
            <button
              key={channel.channelId}
              disabled={
                state.pending ||
                telescopeBusy ||
                !!state.tableId ||
                (!channel.joinable && channel.channelId !== state.roomId)
              }
              onClick={() =>
                void runtime.selectChannel(channel.channelId).then((ok) => {
                  if (ok) setChannelOpen(false)
                })
              }
            >
              {channel.name} · {channel.currentUsers}/{channel.capacity}
            </button>
          ))}
        </section>
      )}
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
