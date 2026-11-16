import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import cover from '../../vrZone/art/skewer-cover-lowpoly.png'
import type { CoopClient } from './client'
import type { CoopRoom } from './contracts'
import { searchCoopRooms } from './roomSearch'
import { roomArtwork } from './roomArtwork'
import './coopRooms.css'

function Lock() {
  return <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="8" width="12" height="8" rx="2" /><path d="M4.5 8V5a3.5 3.5 0 0 1 7 0v3M8 11v2" /></svg>
}

export function CoopRoomBrowser({ client, onClose, onRanking, focusRanking }: {
  client: CoopClient; onClose(): void; onRanking(): void; focusRanking: boolean
}) {
  const state = useStore(client.store)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<CoopRoom | null>(null)
  const [name, setName] = useState('함께 여는 꼬치집')
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [query, setQuery] = useState('')
  const rooms = searchCoopRooms(state.rooms, query)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rankingButton = useRef<HTMLButtonElement>(null)
  const returning = useRef(focusRanking)
  const home = !creating && !selected && state.lobbyPage === 'home'
  useEffect(() => {
    if (home && returning.current) rankingButton.current?.focus({ preventScroll: true })
    else headingRef.current?.focus()
    returning.current = false
  }, [creating, selected, state.lobbyPage, home])
  const busy = state.pending || !state.connected
  const back = () => {
    if (state.pending) return
    client.store.setState({ error: '' })
    setPassword('')
    if (selected) setSelected(null)
    else if (creating) setCreating(false)
    else if (state.lobbyPage === 'rooms') client.store.setState({ lobbyPage: 'home' })
    else onClose()
  }
  const join = async (room: CoopRoom) => {
    client.store.setState({ error: '' })
    if (room.locked && !room.mine) { setSelected(room); setPassword(''); return }
    await client.enter(room.gameId)
  }
  const heading = selected ? '비밀번호를 입력해 주세요' : creating ? '우리 가게를 열어요' : state.lobbyPage === 'rooms' ? '어느 가게에 함께할까요?' : '온탑 꼬치왕'
  return <PaperPopup title="VR 체험관 · 2인 협동 미니게임" label={heading} className="coop-room-paper" onClose={back}
    closeLabel={selected ? '방 목록으로' : creating || state.lobbyPage === 'rooms' ? '이전 화면으로' : '공원으로 나가기'}>
    <header className="coop-room-heading"><p>{selected ? '친구끼리 여는 가게' : creating ? '방 만들기' : state.lobbyPage === 'rooms' ? '참가하기' : '둘이 함께 여는 작은 가게'}</p><h1 ref={headingRef} tabIndex={-1}>{heading}</h1>
      <span>{selected ? `${selected.roomName} · 방장 ${selected.hostNickname}` : creating ? '가게 이름을 짓고, 함께할 친구를 기다려요.' : state.lobbyPage === 'rooms' ? '같은 공원에서 기다리는 친구를 찾아보세요.' : '한 명은 요리사, 한 명은 서빙 담당. 각자의 기기로 함께해요.'}</span></header>
    {state.error ? <p className="paper-error" role="alert">{state.error}</p> : null}
    {!state.connected ? <p role="status" className="paper-error">연결을 확인하고 있어요.</p> : null}
    {creating || selected ? <form className="coop-room-form" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const entered = selected ? await client.enter(selected.gameId, { password }) : await client.enter(undefined, { roomName: name.trim(), password: locked ? password : '' })
      if (entered) setPassword('')
    }}>
      {!selected ? <><label htmlFor="coop-room-name">가게 이름 <small>{name.length}/24</small></label><input id="coop-room-name" value={name} onChange={event => setName(event.target.value)} maxLength={24} required disabled={state.pending} autoComplete="off" placeholder="가게 이름을 입력해 주세요" />
        <label className="coop-room-lock"><input type="checkbox" checked={locked} disabled={state.pending} onChange={event => { setLocked(event.target.checked); setPassword('') }} /><Lock /><span>비밀번호 설정<small>비밀번호를 아는 친구만 참가할 수 있어요.</small></span></label></> : null}
      {selected || locked ? <><label htmlFor="coop-room-password">방 비밀번호</label><input id="coop-room-password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={4} maxLength={20} pattern="[A-Za-z0-9]{4,20}" required autoComplete="off" disabled={state.pending} aria-describedby="coop-password-hint" /><small id="coop-password-hint">영문·숫자 4~20자</small></> : <p className="coop-room-public">누구나 참가할 수 있는 가게로 열려요.</p>}
      <div className="coop-room-form-actions"><button type="button" onClick={back} disabled={state.pending}>돌아가기</button><button className="paper-primary" type="submit" disabled={busy || !selected && !name.trim()}>{state.pending ? '연결 중…' : selected ? '참가하기' : '방 만들기'}</button></div>
    </form> : state.lobbyPage === 'rooms' ? <>
      <div className="coop-room-tools"><button onClick={back}>← 처음으로</button><span>참가 가능한 가게 <b>{state.rooms.length}</b></span><button onClick={() => { setCreating(true); client.store.setState({ error: '' }) }}>방 만들기 ＋</button></div>
      <div className="coop-room-search" role="search" aria-label="협동 방 검색"><label htmlFor="coop-room-query">가게 찾기</label><div><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg><input id="coop-room-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="가게 이름 또는 방장 닉네임" maxLength={80} autoComplete="off" />{query ? <button aria-label="검색어 지우기" onClick={() => setQuery('')}>×</button> : null}</div><span role="status" aria-live="polite">{query.trim() ? `검색 결과 ${rooms.length}개` : `전체 ${rooms.length}개`}</span></div>
      {rooms.length ? <ul className="coop-room-cards">{rooms.map(room => <li key={room.gameId}>
        <div className="coop-room-card-art"><img src={roomArtwork(room.gameId).src} style={{ objectPosition: roomArtwork(room.gameId).position }} alt="" draggable={false} loading="lazy" /><span>{room.locked ? <><Lock />비밀 가게</> : '열린 가게'}</span></div>
        <div className="coop-room-card-body"><h2>{room.roomName}</h2><p>방장 <strong>{room.hostNickname}</strong></p><footer><span><b>{room.players}</b> / 2명</span><button disabled={busy || room.players >= 2 && !room.mine} onClick={() => void join(room)}>{room.mine ? '돌아가기' : '참가하기'} <span aria-hidden="true">→</span></button></footer></div>
      </li>)}</ul> : query.trim() && state.rooms.length ? <div className="coop-room-no-results"><strong>검색한 가게를 찾지 못했어요</strong><p>가게 이름이나 방장 닉네임을 다시 확인해 주세요.</p><button className="paper-primary" onClick={() => setQuery('')}>전체 가게 보기</button></div> : <div className="coop-room-no-results"><strong>아직 문을 연 가게가 없어요</strong><p>먼저 방을 만들고 친구를 초대해 보세요.</p><button className="paper-primary" onClick={() => setCreating(true)}>방 만들기</button></div>}
      <p className="coop-room-footnote">참가한 뒤 역할을 고르고, 두 사람 모두 준비하면 영업을 시작해요.</p>
    </> : <div className="coop-room-home"><figure><img src={cover} alt="주문에 맞춰 꼬치를 만드는 온탑 꼬치왕" draggable={false} /><figcaption>한 장의 주문표, 두 사람의 호흡</figcaption></figure><div><div className="coop-room-badges"><span>2인 협동</span><span>무료 플레이</span></div><h2>함께 운영할<br />가게를 골라보세요</h2><p>새 가게를 열거나<br />친구가 만든 가게에 참가할 수 있어요.</p><button className="paper-primary" disabled={busy} onClick={() => setCreating(true)}>방 만들기 <span aria-hidden="true">＋</span></button><button className="coop-room-join" onClick={() => { client.store.setState({ lobbyPage: 'rooms', error: '' }); void client.refresh() }}>참가하기 <span aria-hidden="true">→</span></button></div></div>}
    {home && <div className="paper-actions"><button ref={rankingButton} type="button" aria-haspopup="dialog" onClick={onRanking}>팀 랭킹 보기</button></div>}
  </PaperPopup>
}
