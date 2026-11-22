import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { estimatedServerTime } from '../../network/worldClient'
import type { CoopTransport } from '../../features/skewer/coop/contracts'
import { YutClient } from './client'
import { YutMatchHeader, YutMatchView } from './YutMatchView'
import { defaultRules, teamName, type YutRules } from './contracts'
import cover from './art/cover.webp'
import './yutnori.css'
import './yutFocus.css'

export default function YutHost({ transport, onClose }: { transport: CoopTransport; onClose(): void }) {
  const [client] = useState(() => new YutClient(transport))
  const { snapshot, rooms, pending, error, connected, uncertain } = useStore(client.store)
  const [page, setPage] = useState<'catalog' | 'rooms' | 'create'>('catalog')
  const [name, setName] = useState('함께 노는 윷판')
  const [rules, setRules] = useState<YutRules>({ ...defaultRules })
  const [teamCount, setTeamCount] = useState(2)
  const [pieceCount, setPieceCount] = useState(4)
  const [selected, setSelected] = useState(-1)
  const [rollId, setRollId] = useState(-1)
  const [confirmExit, setConfirmExit] = useState(false)
  const [manual, setManual] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const [, refreshClock] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const pub = snapshot?.publicState, user = transport.scope().userId
  const own = pub?.players.find(player => player.userId === user)
  const spectator = snapshot?.role === 'SPECTATOR'
  const playing = pub?.phase === 'PLAYING'
  const inMatch = !!pub && pub.phase !== 'WAITING'
  useEffect(() => { if (inMatch) document.getElementById('yut-title')?.focus() }, [inMatch])
  const eliminated = own !== undefined && pub?.eliminatedTeams.includes(own.team)
  const teams = Array.from({ length: pub?.teamCount ?? teamCount }, (_, i) => i)
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => refreshClock(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [playing])
  const seconds = Math.max(0, Math.ceil(((pub?.deadline ?? 0) - estimatedServerTime()) / 1000))
  const myTurn = playing && !spectator && !eliminated && pub.turnUser === user
  const busy = pending || !connected || uncertain
  const activeRoll = pub?.rolls.find(roll => roll.id === rollId) ?? pub?.rolls[0]
  const destinations = myTurn && !busy ? pub.moves.filter(move => move.piece === selected && move.rollId === activeRoll?.id) : []
  const finished = pub?.phase === 'FINISHED'
  const leave = async (forfeit = false) => { if (!snapshot || await client.leave(forfeit)) onClose() }
  const close = () => { if (pending) return; if (manual) { setManual(false); return }; if (confirmExit) { setConfirmExit(false); return }; if (playing && !spectator && !eliminated) setConfirmExit(true); else void leave() }
  useEffect(() => { client.start(); return () => client.stop() }, [client])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (document.pointerLockElement) document.exitPointerLock()
    dialog.current?.showModal(); title.current?.focus()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [])
  const piecePositions = pub?.pieces.map(tokens => tokens.join(',')).join(':')
  useEffect(() => { setSelected(-1); setRollId(-1) }, [pub?.turnUser, piecePositions])
  useEffect(() => {
    if (manual || confirmExit) document.getElementById('yut-overlay-title')?.focus()
    else if (inMatch) document.querySelector<HTMLElement>('.yut-game-menu summary')?.focus()
  }, [manual, confirmExit])
  const titleText = confirmExit ? '경기를 나갈까요?' : snapshot ? '윷놀이' : page === 'catalog' ? '전통놀이 고르기' : page === 'create' ? '윷놀이 방 만들기' : '함께할 윷판을 골라요'
  return <dialog ref={dialog} className={`yut-shell${inMatch ? ' yut-shell--match' : ''}`} data-team-count={pub?.teamCount} aria-labelledby="yut-title" onCancel={event => { event.preventDefault(); close() }}>
    {inMatch && pub ? <YutMatchHeader state={pub} status={finished ? pub.winner < 0 ? '경기 종료' : teamName(pub.winner) + ' 승리!' : eliminated ? '우리 팀 탈락 · 관전 중' : pub.openingTeams?.length ? `선공 결정 · ${teamName(pub.team)} 차례` : pub.lastThrow?.opening ? `${teamName(pub.team)} 선공 · 윷을 던져주세요` : spectator ? '관전 중' : myTurn ? '내 차례예요' : (pub.players.find(player => player.userId === pub.turnUser)?.nickname ?? teamName(pub.team)) + ' 차례'} seconds={seconds} manual={manual} pending={pending} activeExit={!!playing && !spectator && !eliminated} blocked={manual || confirmExit} myTurn={!!myTurn} onChat={() => setChatFocusRequest(value => value + 1)} onManual={() => setManual(value => !value)} onClose={close} /> : <header className="yut-header"><h1 ref={title} tabIndex={-1} id="yut-title">{titleText}</h1><div>
      <button type="button" onClick={() => setManual(value => !value)} aria-expanded={manual}>설명서</button>
      <button type="button" onClick={close} disabled={pending}>{playing && !spectator && !eliminated ? '기권·나가기' : '공원으로'}</button>
    </div></header>}
    {error && <p className="yut-error" role="alert">{error} <button onClick={() => void client.refresh()}>새로고침</button></p>}
    {!connected && <p className="yut-error" role="status">공원 연결을 확인하고 있어요. 다시 연결되면 방 상태를 불러옵니다.</p>}
    {uncertain && <p className="yut-error" role="alert">이전 입력의 처리 여부를 확인해야 해요. <button onClick={() => void client.retry()} disabled={pending}>같은 입력 재확인</button></p>}
    {manual && <div className="yut-modal-layer"><section className="yut-manual" aria-label="윷놀이 설명서"><h2 id="yut-overlay-title" tabIndex={-1}>우리 팀 말을 모두 내보내면 승리!</h2>
      <p>평평한 면이 위인 개수대로 도 1칸 · 개 2칸 · 걸 3칸 · 윷 4칸 · 모 5칸. 붉은 − 표시가 있는 윷 하나만 위면 빽도예요. 윷·모는 한 번 더 던져요.</p>
      <p>말은 판 밖에서 대기하다가 오른쪽 아래 모서리의 위쪽 첫 칸부터 들어가요. 도는 첫 칸, 개는 둘째 칸, 모는 오른쪽 위 모서리예요. 오른쪽 아래 ‘출발·도착’ 칸은 한 바퀴 돌아오는 마지막 칸(참먹이), 가운데는 중앙 칸(방)이에요.</p>
      <p>이동권 → 말 → 빛나는 도착 칸을 순서대로 골라요. 모서리·중앙에 정확히 멈춘 뒤에만 지름길을 선택할 수 있어요. 같은 팀 말은 자동으로 업고, 잡히면 함께 대기석으로 돌아와요.</p>
      <p>상대를 잡으면 추가 던지기! 참먹이에 딱 멈추면 아직 완주가 아니에요. 한 칸 이상 더 나가야 해요. 낙은 남은 이동권과 던지기를 잃고 차례를 넘겨요. 한 차례는 90초예요.</p>
      <p>2~4명이 참가하고, 방장이 2~4팀과 팀마다 말 1~4개를 정해요. 선택한 모든 팀에 한 명 이상 필요해요. 팀 안에서도 번갈아 조작해요. 각 팀 대표가 윷 4개를 던져 모·윷·걸·개·도·빽도 순으로 선공을 정하고, 최고 동률 팀만 다시 던져요. 판·스택의 숫자는 말 번호 또는 업힌 말 개수예요.</p>
      <p>판 위 칸을 누르면 같은 경기 참가자·관전자에게 위치 핑을 보내요. 전체 채팅은 같은 경기의 참가자·관전자에게, 팀 채팅은 같은 팀에게만 보여요. 빽도와 추가 기회 중복은 아래 방 규칙을 따라요.</p>
      <RuleSummary rules={pub?.rules ?? rules} /><button onClick={() => setManual(false)}>설명서 닫기</button></section></div>}
    {confirmExit && <div className="yut-modal-layer"><section className="yut-exit"><h2 id="yut-overlay-title" tabIndex={-1}>나가면 우리 팀이 탈락해요.</h2><p>같은 팀원도 함께 탈락하고, 남은 팀은 계속 경기해요. 마지막 한 팀이 승리해요.</p><div className="yut-actions"><button onClick={() => setConfirmExit(false)}>계속하기</button><button className="yut-primary" disabled={pending} onClick={() => void leave(true)}>기권하고 공원으로</button></div></section></div>}
    {!snapshot ? page === 'catalog' ? <section className="yut-catalog">
        <button className="yut-augment-card" onClick={() => setPage('rooms')}><img src={cover} alt="나무 윷가락과 청팀·홍팀 말" /><strong>윷놀이</strong><span>업고, 잡고, 지름길로!<br />친구와 함께하는 우리 팀의 한 판</span><b>2~4인 팀전 · 무료</b></button>
        <p>놀이를 고른 뒤 방을 만들거나 친구의 방에 참가하세요.</p>
      </section> : page === 'create' ? <form className="yut-create yut-paper" onSubmit={event => { event.preventDefault(); void client.create(name.trim(), rules, teamCount, pieceCount) }}>
        <img src={cover} className="yut-room-art" alt="전통 공원의 나무 윷놀이 도구" />
        <div><label htmlFor="yut-room-name">방 이름</label><input id="yut-room-name" value={name} maxLength={24} required onChange={event => setName(event.target.value)} />
          <fieldset disabled={pending}><legend>팀과 말 수</legend>
            <div className="yut-settings"><div><label htmlFor="yut-team-count">팀 수</label><select id="yut-team-count" value={teamCount} onChange={event => setTeamCount(Number(event.target.value))}>{[2, 3, 4].map(count => <option key={count} value={count}>{count}팀</option>)}</select></div>
            <div><label htmlFor="yut-piece-count">팀별 말 수</label><select id="yut-piece-count" value={pieceCount} onChange={event => setPieceCount(Number(event.target.value))}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}개</option>)}</select></div></div><p>최대 4명 · 모든 팀에 한 명 이상 필요해요.</p>
          </fieldset><fieldset disabled={pending}><legend>시작 전에 정하는 우리 방 규칙</legend>
            <label><input type="checkbox" checked={rules.emptyBackEnters} onChange={event => setRules({ ...rules, emptyBackEnters: event.target.checked })} />판 위에 말이 없을 때 빽도: 도 자리에 새 말 놓기<small>끄면 빽도 무효</small></label>
            <label><input type="checkbox" checked={rules.doubleCaptureBonus} onChange={event => setRules({ ...rules, doubleCaptureBonus: event.target.checked })} />윷·모로 잡으면 추가 기회 중복<small>끄면 윷·모의 추가 던지기만 적용</small></label>
            <label><input type="checkbox" checked={rules.backHomeFinish} onChange={event => setRules({ ...rules, backHomeFinish: event.target.checked })} />참먹이에서 빽도면 바로 완주<small>끄면 실제로 온 길을 한 칸 되돌아감</small></label>
          </fieldset><div className="yut-actions"><button type="button" onClick={() => setPage('rooms')} disabled={pending}>돌아가기</button><button className="yut-primary" disabled={busy || !name.trim()}>방 만들기</button></div>
        </div></form> : <section className="yut-rooms yut-paper"><div className="yut-room-intro"><img src={cover} alt="" /><div><h2>같이 놀면 더 즐거운 윷놀이</h2><p>모든 팀이 준비하면 시작해요.<br />2~4팀 · 팀마다 말 1~4개 · 최대 4인 · 무료</p><button className="yut-primary" disabled={busy} onClick={() => setPage('create')}>새 방 만들기</button></div></div>
        <div className="yut-room-list"><h2>참가할 수 있는 방</h2><button disabled={pending} onClick={() => void client.refresh()}>목록 새로고침</button>
          {rooms.length ? <ul>{rooms.map(room => <li key={room.gameId}><div><strong>{room.name}</strong><span>방장 {room.hostNickname} · {room.players}/4명 · {room.teamCount}팀 · 말 {room.pieceCount}개 · {room.phase === 'PLAYING' ? '진행 중' : '대기 중'}</span></div>
            <button disabled={busy || room.phase === 'WAITING' && room.players >= 4} onClick={() => void client.join(room.gameId, room.phase === 'PLAYING')}>{room.phase === 'PLAYING' ? '관전하기' : '참가하기'}</button></li>)}</ul>
            : <p className="yut-empty">아직 열린 방이 없어요.<br />새 윷판을 열고 친구를 기다려 보세요.</p>}
        </div></section>
      : pub?.phase === 'WAITING' ? <section className="yut-lobby yut-paper"><h2>{pub.roomName}</h2><p>{pub.teamCount}팀 · 팀마다 말 {pub.pieceCount}개 · 최대 4명. 모든 팀에 한 명 이상 참가하고 준비해야 해요.</p>
        <div className="yut-teams">{teams.map(team => <section key={team} className={`yut-team-box yut-team-${team}`}><h3>{teamName(team)}</h3>
          {pub.players.filter(player => player.team === team).map(player => <p key={player.userId}><strong>{player.nickname}</strong> {player.userId === pub.host ? '방장 · ' : ''}{player.ready ? '준비 완료' : '준비 중'}{!player.connected && ' · 연결 끊김'}</p>)}
          <button disabled={busy || own?.team === team} onClick={() => void client.lobby({ type: 'TEAM', team })}>{teamName(team)} 선택</button></section>)}</div>
        <RuleSummary rules={pub.rules} /><div className="yut-actions"><button className="yut-primary" disabled={busy} onClick={() => void client.lobby({ type: 'READY', ready: !own?.ready })}>{own?.ready ? '준비 취소' : '준비 완료'}</button>
          {pub.host === user && <button className="yut-primary" disabled={busy || pub.players.length < 2 || pub.players.some(player => !player.ready) || new Set(pub.players.map(player => player.team)).size !== pub.teamCount} onClick={() => void client.begin()}>윷놀이 시작</button>}</div>
      </section> : snapshot && <YutMatchView client={client} snapshot={snapshot} user={user} busy={busy} pending={pending} myTurn={!!myTurn} selected={selected} activeRoll={activeRoll} destinations={destinations} onPiece={setSelected} onRoll={id => { setRollId(id); setSelected(-1) }} blocked={manual || confirmExit} chatFocusRequest={chatFocusRequest} onLeave={() => void leave()} rules={<RuleSummary rules={snapshot.publicState.rules} />} />}
  </dialog>
}

function RuleSummary({ rules }: { rules: YutRules }) {
  return <details className="yut-rules"><summary>우리 방 규칙</summary><p>말이 없을 때 빽도: {rules.emptyBackEnters ? '도 자리에 새 말' : '무효'}<br />윷·모 잡기: 추가 기회 {rules.doubleCaptureBonus ? '중복 적용' : '1회만 적용'}<br />참먹이 빽도: {rules.backHomeFinish ? '완주' : '실제 이동 경로로 한 칸 후퇴'}</p></details>
}
