import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../config'
import { useSession } from '../network/worldClient'
import { bindAnchor } from '../network/tableBindings'
import { useParkRuntime } from './runtime/ParkRuntime'
import { summarizeFrames } from '../performance/metrics'
import { GameControls, OmokPanel } from '../game/OmokPanel'
import { useGame, tableBusy } from '../game/store'

export function ParkTools({
  quality,
  onQuality,
}: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  const runtime = useParkRuntime()
  const gameVisible = useGame((s) => !!s.game)
  const gameBusy = useGame(tableBusy)
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
  const tableId = bindAnchor(
      state.bindings,
      state.roomId,
      state.focusedAnchorId,
      state.tables.map((t) => t.tableId),
    ),
    table = tableId ? state.tableStates[tableId] : undefined
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
      {state.focusedAnchorId && !gameVisible && (
        <section
          role="dialog"
          aria-label="테이블 정보"
          className="park-runtime-panel park-table-panel"
        >
          <strong>테이블 · {state.focusedAnchorId}</strong>
          <button aria-label="테이블 정보 닫기" onClick={runtime.closeTable}>
            닫기
          </button>
          {!tableId ? (
            <p>서버 테이블과 공원 배치 연결이 필요합니다.</p>
          ) : (
            <>
              {table ? (
                <ul>
                  {table.seats.map((seat) => (
                    <li key={seat.seatNumber}>
                      {seat.seatNumber}번 ·{' '}
                      {seat.userId === state.sessionId
                        ? '나'
                        : seat.userId
                          ? '산책자'
                          : '빈자리'}
                      {seat.ready ? ' · 준비' : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>테이블 상태 확인 중</p>
              )}
              {state.tableId === tableId ? (
                <button
                  disabled={state.pending || gameBusy}
                  onClick={() => void runtime.leaveTable()}
                >
                  일어나기
                </button>
              ) : (
                <button
                  disabled={state.pending || !!state.tableId}
                  onClick={() => void runtime.joinTable()}
                >
                  앉기
                </button>
              )}
              {tableId && <GameControls tableId={tableId} />}
            </>
          )}
        </section>
      )}
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
