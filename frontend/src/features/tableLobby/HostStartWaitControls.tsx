import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { TableState } from '../../network/protocol'
import { useSession } from '../../network/worldClient'
import { useGame } from '../../game/store'
import { activeHostWait, formatHostWait, hostWaitSeconds, HOST_START_WAIT_SECONDS, resetHostStartWait, useHostStartWait } from './hostStartWait'
import './hostStartWait.css'

interface Props { table: TableState; selectedCount: number | null }
function useCountdown({ table, selectedCount }: Props) {
  const state = useHostStartWait()
  const s = useSession(useShallow(s => [s.sessionId, s.roomId, s.status] as const))
  const phase = useGame(g => g.start?.phase)
  const snapshot = activeHostWait(state, table, s[0], s[1], selectedCount, s[2] === 'connected', phase)
  const [, refresh] = useState(0)
  useEffect(() => {
    if (!snapshot) return
    const tick = () => refresh(n => n + 1)
    const timer = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [snapshot])
  return { snapshot, seconds: hostWaitSeconds(snapshot) }
}
export function HostStartWaitStatus({ table, selectedCount, fallback }: Props & { fallback: string }) {
  const { seconds } = useCountdown({ table, selectedCount })
  const own = useSession(s => s.sessionId)
  const host = table.selectorUserId === own
  if (seconds === null) return <div className="tablet-waiting-status" aria-live="polite">{fallback}
    {selectedCount !== null && table.allReady && <small className="host-wait-unconfirmed">시작 제한 {HOST_START_WAIT_SECONDS / 60}분 · 서버 시간 확인 대기</small>}</div>
  return <div className="host-start-wait" data-urgent={seconds <= 30} data-expired={seconds === 0}>
    <strong role="status">{seconds === 0 ? '시작 대기 시간이 끝났어요. 서버 처리를 확인하고 있어요.'
      : host ? '모두 준비했어요. 시간 안에 게임을 시작해주세요.' : '모두 준비했어요. 방장의 시작을 기다리고 있어요.'}</strong>
    <time role="timer" aria-label="방장 게임 시작 남은 시간" aria-live="off">{formatHostWait(seconds)}</time>
    <small>{seconds === 0 ? '퇴장과 새 방장 선정은 서버 확인 후 반영돼요.' : '2분 동안 시작하지 않으면 방장이 자동으로 일어나고, 남은 인원 중 새 방장이 선정돼요.'}</small>
  </div>
}
export function HostStartButton({ table, selectedCount, disabled, onStart }: Props & { disabled: boolean; onStart: () => void }) {
  const { snapshot, seconds } = useCountdown({ table, selectedCount })
  return <button className="tablet-primary" disabled={disabled || seconds === 0} onClick={() => {
    if (!disabled && hostWaitSeconds(snapshot) !== 0) onStart()
  }}>게임 시작</button>
}
export function HostStartWaitNotice() {
  const state = useHostStartWait()
  const s = useSession(useShallow(s => ({ own: s.sessionId, channel: s.roomId, status: s.status, tableId: s.tableId,
    table: state.scope ? s.tableStates[state.scope.tableId] : undefined, profiles: s.profiles })))
  const phase = useGame(g => g.start?.phase)
  useEffect(() => {
    const scope = state.scope
    if (scope && (s.status !== 'connected' || scope.userId !== s.own || scope.channelId !== s.channel
      || (s.tableId && scope.tableId !== s.tableId))) resetHostStartWait()
  }, [state.scope, s.own, s.channel, s.status, s.tableId])
  const { scope, receipt } = state, table = s.table
  if (!scope || !receipt || receipt.eventId === state.dismissedEventId || s.status !== 'connected'
    || scope.userId !== s.own || scope.channelId !== s.channel || (s.tableId && s.tableId !== scope.tableId)
    || (phase && phase !== 'WAITING')) return null
  // TABLE_LEFT legitimately removes the cached table; an own departure plus the server receipt suffices.
  const removed = receipt.previousHostUserId === s.own && !s.tableId
    && (!table || (table.version >= receipt.tableVersion && !table.seats.some(seat => seat.userId === s.own)))
  const seated = s.tableId === scope.tableId && table && table.version >= receipt.tableVersion
    && table.selectorUserId === receipt.nextHostUserId && !table.seats.some(seat => seat.userId === receipt.previousHostUserId)
    && table.seats.some(seat => seat.userId === s.own)
  if (!removed && !seated) return null
  const name = receipt.nextHostUserId ? s.profiles[receipt.nextHostUserId]?.nickname ?? '다른 참가자' : ''
  return <aside className="host-start-notice" aria-label="방장 대기시간 처리 안내">
    <div role="status"><strong>{removed ? '게임 시작 대기시간이 지나 테이블에서 일어났어요.'
      : receipt.nextHostUserId === s.own ? '새 방장이 되었어요.' : `${name}님이 새 방장이 되었어요.`}</strong>
      <p>{removed ? '2분 동안 게임이 시작되지 않았어요. 다시 앉아서 참여할 수 있어요.'
        : '이전 방장이 2분 동안 시작하지 않아 일어났어요. 참가 인원을 채우고 다시 준비해주세요.'}</p></div>
    <button onClick={() => useHostStartWait.setState({ dismissedEventId: receipt.eventId })} aria-label="방장 대기시간 안내 닫기">닫기</button>
  </aside>
}
