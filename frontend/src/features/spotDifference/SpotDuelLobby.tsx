import { useState, type RefObject } from 'react'
import { cards, type Difficulty, type DuelRoom } from './api'

export type DuelLobbyPage = 'home' | 'create' | 'rooms'
const pageSize = 6

export function SpotDuelLobby({ page, navigate, rooms, loading, failed, busy, refresh, join, create, headingRef }: {
  page: DuelLobbyPage; navigate: (page: DuelLobbyPage) => void; rooms: DuelRoom[]; loading: boolean
  failed: boolean; busy: boolean; refresh: () => void; join: (id: string) => void
  create: (difficulty: Difficulty, title: string) => void; headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const [title, setTitle] = useState(''), [difficulty, setDifficulty] = useState<Difficulty>('NORMAL')
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('ALL'), [index, setIndex] = useState(0)
  const term = query.trim().toLocaleLowerCase('ko-KR')
  const found = rooms.filter(room => (!term || room.title.toLocaleLowerCase('ko-KR').includes(term))
    && (filter === 'ALL' || room.difficulty === filter))
  const pages = Math.max(1, Math.ceil(found.length / pageSize)), current = Math.min(index, pages - 1)
  // 목록이 다시 늘어도 사라졌던 페이지로 돌아가지 않도록 선택 상태도 낮춘다.
  if (index !== current) setIndex(current)
  const visible = found.slice(current * pageSize, (current + 1) * pageSize)
  const go = (next: DuelLobbyPage) => { setIndex(0); navigate(next) }

  return <section className="spot-duel-lobby" aria-label="멀티플레이 방 선택">
    <h3 ref={headingRef} tabIndex={-1}>{page === 'create' ? '새 대결방을 만들어요' : page === 'rooms' ? '함께할 방을 골라보세요' : '친구와 함께 틀린 그림 찾기'}</h3>
    {page === 'home' ? <div className="spot-duel-home">
      <img src="/art/spot-difference/range-counter-original.webp" alt="" />
      <div><span className="spot-duel-badge">2인 대결 · 같은 공원</span><h4>같은 그림에서<br />누가 먼저 찾을까요?</h4>
        <p>새 방을 열거나 친구가 만든 방에 참가해요.</p>
        <button type="button" className="spot-primary" disabled={busy} onClick={() => go('create')}>방 만들기 ＋</button>
        <button type="button" className="spot-guide-back" disabled={busy} onClick={() => go('rooms')}>참가하기 →</button>
      </div>
    </div> : page === 'create' ? <form className="spot-duel-create" onSubmit={event => {
      event.preventDefault(); if (!busy) create(difficulty, title.trim())
    }}>
      <label className="spot-room-title" htmlFor="spot-room-name">방 이름 (선택) <small>{title.length} / 40</small>
        <input id="spot-room-name" value={title} maxLength={40} autoComplete="off" disabled={busy}
          placeholder="함께 틀린 그림 찾아요" onChange={event => setTitle(event.target.value)} />
      </label>
      <fieldset disabled={busy}><legend>난이도</legend><div className="spot-duel-levels">
        {(Object.keys(cards) as Difficulty[]).map(choice => <label key={choice} data-selected={difficulty === choice}>
          <input type="radio" name="spot-duel-difficulty" value={choice} checked={difficulty === choice} onChange={() => setDifficulty(choice)} />
          <span><strong>{cards[choice].label}</strong><small>{cards[choice].detail}</small></span>
        </label>)}
      </div></fieldset>
      <p>공개 방으로 만들어져 같은 공원의 다른 사람이 참가할 수 있어요.</p>
      <div className="spot-actions"><button type="button" className="spot-guide-back" disabled={busy} onClick={() => go('home')}>돌아가기</button>
        <button type="submit" className="spot-primary" disabled={busy}>{busy ? '방 만드는 중…' : '방 만들기'}</button></div>
    </form> : <>
      <div className="spot-duel-tools"><button type="button" className="spot-guide-back" disabled={busy} onClick={() => go('home')}>← 처음으로</button>
        <button type="button" className="spot-guide-back" disabled={busy || loading} onClick={refresh}>새로고침</button>
        <button type="button" className="spot-primary" disabled={busy} onClick={() => go('create')}>방 만들기 ＋</button></div>
      <div className="spot-duel-search" role="search" aria-label="대결방 검색">
        <label htmlFor="spot-room-query">방 찾기<input id="spot-room-query" type="search" value={query} maxLength={80}
          placeholder="방 이름으로 검색" onChange={event => { setQuery(event.target.value); setIndex(0) }} /></label>
        <label htmlFor="spot-room-level">난이도<select id="spot-room-level" value={filter} onChange={event => { setFilter(event.target.value); setIndex(0) }}>
          <option value="ALL">전체</option><option value="NORMAL">보통</option><option value="HARD">어려움</option></select></label>
      </div>
      <p className="spot-duel-count" role="status" aria-live="polite">{loading ? '방 목록을 불러오는 중이에요.' : `참가 가능한 방 ${found.length}개`}</p>
      {failed ? <p role="alert">방 목록을 불러오지 못했어요. 새로고침해 주세요.</p> : visible.length ? <>
        <ul className="spot-duel-grid" aria-label="참가 가능한 방" tabIndex={0}>{visible.map(room => <li key={room.id}>
          <img src={`/art/spot-difference/${cards[room.difficulty].previewScene}-original.webp`} alt="" loading="lazy" />
          <div><span className="spot-duel-badge">{cards[room.difficulty].label} · {room.players}/{room.capacity}명</span>
            <h4 title={room.title}>{room.title}</h4>
            <button type="button" className="spot-primary" disabled={busy || room.players >= room.capacity}
              aria-label={`${room.title} 참가하기`} onClick={() => join(room.id)}>참가하기 →</button></div>
        </li>)}</ul>
        <nav className="spot-duel-pages" aria-label="대결방 페이지">
          <button type="button" className="spot-guide-back" disabled={busy || current === 0} onClick={() => setIndex(current - 1)}>← 이전</button>
          <span aria-live="polite">{current + 1} / {pages} 페이지</span>
          <button type="button" className="spot-guide-back" disabled={busy || current + 1 >= pages} onClick={() => setIndex(current + 1)}>다음 →</button>
        </nav>
      </> : !loading && <div className="spot-duel-empty"><strong>{term || filter !== 'ALL' ? '조건에 맞는 방이 없어요' : '아직 대기 중인 방이 없어요'}</strong>
        <p>{term || filter !== 'ALL' ? '검색어나 난이도를 바꿔 보세요.' : '먼저 방을 만들고 친구를 기다려 보세요.'}</p>
        <button type="button" className="spot-primary" disabled={busy} onClick={() => go('create')}>방 만들기</button></div>}
    </>}
  </section>
}
