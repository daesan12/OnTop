import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../config'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from './runtime/ParkRuntime'
import { summarizeFrames } from '../performance/metrics'
import { OmokPanel } from '../game/OmokPanel'
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
    })),
  )
  const [channelOpen, setChannelOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [report, setReport] = useState(summarizeFrames)
  useEffect(() => {
    if (!settings) return
    const timer = setInterval(() => setReport(summarizeFrames()), 1000)
    return () => clearInterval(timer)
  }, [settings])
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
        <button
          onClick={() => setSettings((value) => !value)}
          aria-expanded={settings}
        >
          그래픽 · 성능
        </button>
        {settings && (
          <section className="park-runtime-panel" aria-label="그래픽과 성능">
            <label>
              그래픽{' '}
              <select
                aria-label="그래픽 품질"
                value={quality}
                onChange={(event) =>
                  onQuality(event.target.value as QualityPreset)
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <p>
              {report.width}×{report.height} · {report.fps.toFixed(1)} FPS
            </p>
            <p>
              p95 {report.p95.toFixed(1)}ms · {report.drawCalls} calls ·{' '}
              {report.triangles.toLocaleString()} tris
            </p>
            <p>
              {report.geometries} geometries · {report.textures} textures
            </p>
          </section>
        )}
      </div>
      <TableLobby />
      <OmokPanel />
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
