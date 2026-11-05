import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { parkName } from './parkName'
import dotOpen from './icons/dot-open.svg'
import dotFull from './icons/dot-full.svg'
import './channelEntry.css'

export function ChannelEntryGate() {
  const runtime = useParkRuntime()
  const state = useSession(useShallow(session => ({
    status: session.status,
    error: session.error,
    roomId: session.roomId,
    channelName: session.channelName,
    players: session.playerCount,
    capacity: session.capacity,
    channels: session.channels,
    pending: session.pending,
  })))
  const previousRoom = useRef(state.roomId)
  const [arrival, setArrival] = useState('')

  useEffect(() => {
    if (state.roomId && state.roomId !== previousRoom.current) {
      const current = useSession.getState()
      setArrival(`${parkName(current.channelName)}에 입장했어요 · ${current.playerCount}/${current.capacity}명`)
      const timer = window.setTimeout(() => setArrival(''), 2_600)
      previousRoom.current = state.roomId
      return () => window.clearTimeout(timer)
    }
    previousRoom.current = state.roomId
  }, [state.roomId])

  if (state.roomId) return arrival
    ? <div className="park-channel-arrival" role="status">{arrival}</div>
    : null

  const connected = state.status === 'connected'
  const choosing = state.status !== 'error' && (!connected || state.pending)
  const retry = () => {
    if (connected) void runtime.enterRecommendedChannel()
    else runtime.reconnect()
  }

  return <div className="park-channel-entry-backdrop">
    <section className="park-channel-entry" role={choosing ? 'status' : 'dialog'}
      aria-live="polite" aria-label="공원 입장">
      <span className="park-channel-entry__leaf" aria-hidden="true">🌱</span>
      <h2>{choosing ? '입장할 공원을 찾고 있어요…' : '입장할 공원을 골라주세요'}</h2>
      <p>{choosing
        ? '혼잡하지 않은 공원으로 안전하게 연결하고 있어요.'
        : state.error || '자동 입장을 완료하지 못했습니다. 아래 공원을 직접 선택할 수 있어요.'}</p>
      {!choosing && <>
        <div className="park-channel-entry__choices" aria-label="입장 가능한 채널">
          {state.channels.map(channel => {
            const full = !channel.joinable
            return <button type="button" key={channel.channelId} disabled={state.pending || full}
              onClick={() => void runtime.selectChannel(channel.channelId)}>
              <img src={full ? dotFull : dotOpen} alt="" />
              <strong>{parkName(channel.name)}</strong>
              <span>{channel.currentUsers} / {channel.capacity}</span>
              {full && <small>가득 참</small>}
            </button>
          })}
        </div>
        <button className="park-channel-entry__retry" type="button" onClick={retry} disabled={state.pending}>
          {connected ? '빈 공원 다시 찾기' : '서버 다시 연결'}
        </button>
      </>}
    </section>
  </div>
}
