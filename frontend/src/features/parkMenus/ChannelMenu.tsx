import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import parkLogo from '../../assets/entry/ontop-logo.webp'
import { parkName } from '../parkMenus/parkName'
import peopleImage from '../../assets/entry/park-people.webp'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTelescopeState } from '../telescopes/state'
import dotOpen from './icons/dot-open.svg'
import dotFull from './icons/dot-full.svg'
import infoIcon from './icons/icon-info.svg'
import chevronIcon from './icons/chevron-channel.svg'
import './parkMenus.css'

/** Channel chip and its dropdown. CHANNEL_JOIN stays in the runtime; this only picks a target. */
export function ChannelMenu() {
  const runtime = useParkRuntime()
  const state = useSession(useShallow(s => ({
    name: s.channelName, players: s.playerCount, capacity: s.capacity,
    channels: s.channels, roomId: s.roomId, tableId: s.tableId, pending: s.pending, ownId: s.sessionId,
  })))
  const telescopeBusy = useTelescopeState(s => s.pending || !!s.placements[state.ownId])
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const shown = open
  const fold = () => setOpen(false)
  useEffect(() => {
    if (!shown) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) fold() }
    const escape = (event: KeyboardEvent) => { if (event.code === 'Escape') fold() }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape) }
  }, [shown])
  return <div className="park-channel-menu" ref={root}>
    <button className="park-location" type="button" aria-label="현재 공원과 접속 인원" aria-haspopup="true"
      aria-expanded={shown} aria-controls="park-channel-dropdown" onClick={() => {
        if (shown) fold()
        else { setOpen(true); void runtime.refreshChannels() }
      }}>
      <span className="park-location__icon"><img className="park-location__logo" src={parkLogo} alt="온탑 로고" width="90" height="60" /></span>
      <span className="park-location__details">
        <span className="park-location__name">{parkName(state.name) || '채널 선택'}</span>
        <span className="park-location__population">
          {state.roomId && <img className="park-location__dot" src={dotOpen} alt="" />}
          <img src={peopleImage} alt="" />
          <span>{state.players} / {state.capacity}</span>
        </span>
      </span>
      <img className="park-chevron" src={chevronIcon} alt="" />
    </button>
    {shown && <section id="park-channel-dropdown" className="park-menu-dropdown park-channel-dropdown" aria-label="채널 선택">
      <strong className="park-channel-dropdown__title">채널 선택</strong>
      {state.channels.map(channel => {
        const current = channel.channelId === state.roomId
        const full = !channel.joinable && !current
        return <button key={channel.channelId} type="button" className="park-channel-option" aria-current={current || undefined}
          disabled={state.pending || telescopeBusy || !!state.tableId || full}
          onClick={() => {
            if (current) { setOpen(false); return }
            void runtime.selectChannel(channel.channelId).then(ok => { if (ok) setOpen(false) })
          }}>
          <img src={full ? dotFull : dotOpen} alt="" />
          <span className="park-channel-option__name">{parkName(channel.name)}</span>
          <span className="park-channel-option__count">{channel.currentUsers} / {channel.capacity}</span>
          {current && <span className="park-menu-badge park-menu-badge--current">현재</span>}
          {full && <span className="park-menu-badge">가득 참</span>}
        </button>
      })}
      <p className="park-channel-dropdown__note"><img src={infoIcon} alt="" />테이블에 앉아 있을 때는 채널을 바꿀 수 없어요</p>
    </section>}
  </div>
}
