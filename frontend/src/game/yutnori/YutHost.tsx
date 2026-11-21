import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { estimatedServerTime } from '../../network/worldClient'
import type { CoopTransport } from '../../features/skewer/coop/contracts'
import { YutClient } from './client'
import { Board } from './Board'
import { StickResult } from './StickResult'
import { defaultRules, teamName, type YutRules } from './contracts'
import cover from './art/cover.webp'
import './yutnori.css'

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
  const [, refreshClock] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const pub = snapshot?.publicState, user = transport.scope().userId
  const own = pub?.players.find(player => player.userId === user)
  const spectator = snapshot?.role === 'SPECTATOR'
  const playing = pub?.phase === 'PLAYING'
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
  const close = () => { if (pending) return; if (playing && !spectator && !eliminated) setConfirmExit(true); else void leave() }
  useEffect(() => { client.start(); return () => client.stop() }, [client])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (document.pointerLockElement) document.exitPointerLock()
    dialog.current?.showModal(); title.current?.focus()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [])
  const piecePositions = pub?.pieces.map(tokens => tokens.join(',')).join(':')
  useEffect(() => { setSelected(-1); setRollId(-1) }, [pub?.turnUser, piecePositions])
  const titleText = confirmExit ? '경기를 나갈까요?' : snapshot ? '윷놀이' : page === 'catalog' ? '전통놀이 고르기' : page === 'create' ? '윷놀이 방 만들기' : '함께할 윷판을 골라요'
  return <dialog ref={dialog} className="yut-shell" aria-labelledby="yut-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="yut-header"><h1 ref={title} tabIndex={-1} id="yut-title">{titleText}</h1><div>
      <button type="button" onClick={() => setManual(value => !value)} aria-expanded={manual}>설명서</button>
      <button type="button" onClick={close} disabled={pending}>{playing && !spectator && !eliminated ? '기권·나가기' : '공원으로'}</button>
    </div></header>
    {error && <p className="yut-error" role="alert">{error} <button onClick={() => void client.refresh()}>새로고침</button></p>}
    {!connected && <p className="yut-error" role="status">공원 연결을 확인하고 있어요. 다시 연결되면 방 상태를 불러옵니다.</p>}
    {uncertain && <p className="yut-error" role="alert">이전 입력의 처리 여부를 확인해야 해요. <button onClick={() => void client.retry()} disabled={pending}>같은 입력 재확인</button></p>}
    {manual && <section className="yut-manual" aria-label="윷놀이 설명서"><h2>우리 팀 말을 모두 내보내면 승리!</h2>
      <p>평평한 면이 위인 개수대로 도 1칸 · 개 2칸 · 걸 3칸 · 윷 4칸 · 모 5칸. 표시된 윷 하나만 위면 빽도예요. 윷·모는 한 번 더 던져요.</p>
      <p>이동권 → 말 → 빛나는 도착 칸을 순서대로 골라요. 모서리·중앙에 정확히 멈춘 뒤에만 지름길을 선택할 수 있어요. 같은 팀 말은 자동으로 업고, 잡히면 함께 대기석으로 돌아와요.</p>
      <p>상대를 잡으면 추가 던지기! 참먹이에 딱 멈추면 아직 완주가 아니에요. 한 칸 이상 더 나가야 해요. 낙은 남은 이동권과 던지기를 잃고 차례를 넘겨요. 한 차례는 90초예요.</p>
      <p>2~4명이 참가하고, 방장이 2~4팀과 팀마다 말 1~4개를 정해요. 선택한 모든 팀에 한 명 이상 필요해요. 팀 안에서도 번갈아 조작해요. 선공은 대표가 윷 두 개씩 던져 정하며 동률은 재던져요. 판·스택의 숫자는 말 번호 또는 업힌 말 개수예요.</p>
      <p>판 위 칸을 누르면 같은 경기 참가자·관전자에게 위치 핑을 보내요. 채팅은 이 경기 안에서만 공유돼요. 빽도와 추가 기회 중복은 아래 방 규칙을 따라요.</p>
      <button onClick={() => setManual(false)}>설명서 닫기</button></section>}
    {confirmExit ? <section className="yut-exit"><h2>나가면 우리 팀이 탈락해요.</h2><p>같은 팀원도 함께 탈락하고, 남은 팀은 계속 경기해요. 마지막 한 팀이 승리해요.</p><div className="yut-actions"><button onClick={() => setConfirmExit(false)}>계속하기</button><button className="yut-primary" disabled={pending} onClick={() => void leave(true)}>기권하고 공원으로</button></div></section>
      : !snapshot ? page === 'catalog' ? <section className="yut-catalog">
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
      </section> : pub && <>
        <div className="yut-game-layout"><section className="yut-board-region"><Board state={pub} selected={selected} destinations={destinations}
          onPiece={(team, piece) => { if (myTurn && team === pub.team) setSelected(piece) }}
          onMove={move => { if (!busy) void client.act({ type: 'MOVE', piece: selected, rollId: activeRoll!.id, shortcut: move.shortcut }) }}
          onPing={node => { if (!busy) void client.feedback(`📍 윷판 ${node}번 칸`) }} />
          <p className="yut-board-caption">바깥길 20칸 + 안쪽 9칸 = 29칸 · 참먹이 다음이 첫 도 · 한 칸 더 나가야 완주</p>
        </section><aside className="yut-play-panel"><div className="yut-teams">{teams.map(team => <section key={team} className={`yut-team-box yut-team-${team}`} data-turn={pub.team === team && !finished} data-eliminated={pub.eliminatedTeams.includes(team)}>
          <h2>{teamName(team)} <small>{pub.pieces[team].filter(node => node === 30).length}/{pub.pieceCount} 완주{pub.eliminatedTeams.includes(team) && ' · 탈락'}</small></h2>
          <p>{pub.players.filter(player => player.team === team).map(player => player.nickname + (player.userId === user ? ' (나)' : '')).join(' · ')}</p>
          <div className="yut-piece-rack">{pub.pieces[team].map((node, piece) => <button key={piece} className={`yut-token yut-team-${team}`} disabled={!myTurn || team !== pub.team || node === 30 || busy}
            aria-pressed={selected === piece && pub.team === team} aria-label={`${teamName(team)} ${piece + 1}번 말 선택`}
            onClick={() => setSelected(piece)}>{node === 30 ? '✓' : piece + 1}<small>{pub.eliminatedTeams.includes(team) ? '탈락' : node === 0 ? '대기' : node === 30 ? '완주' : '판 위'}</small></button>)}</div>
        </section>)}</div>
          <section className="yut-turn yut-paper" aria-live="polite"><h2>{finished ? pub.winner < 0 ? '경기 종료' : `${teamName(pub.winner)} 승리!` : eliminated ? '우리 팀 탈락 · 관전 중' : spectator ? '관전 중' : myTurn ? '내 차례예요' : `${pub.players.find(player => player.userId === pub.turnUser)?.nickname ?? teamName(pub.team)} 차례`}</h2>
            <p>{pub.message}</p>
            {playing && <p className={`yut-countdown ${seconds <= 15 ? 'yut-countdown--urgent' : ''}`} role="timer" aria-live="off">남은 차례 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
            {finished ? <><p>{pub.reason === 'YUT_COMPLETED' ? '승리 팀의 말이 모두 완주했어요.' : pub.reason === 'YUT_TURN_TIMEOUT' ? '90초 안에 차례를 마치지 못했어요.' : pub.reason === 'YUT_FORFEIT' ? '기권 후 마지막 남은 팀이 승리했어요.' : '연결 유예 시간이 지나 경기가 종료되었어요.'}</p><button className="yut-primary" disabled={pending} onClick={() => void leave()}>공원으로 돌아가기</button></>
              : <><button className="yut-primary yut-throw" disabled={!myTurn || busy || pub.credits < 1 || pub.rolls.length >= 32} onClick={() => void client.act({ type: 'THROW' })}>{pending ? '확인 중…' : '윷 던지기'} {pub.credits > 0 && `(${pub.credits})`}</button>
                <p className="yut-backdo-key"><span aria-hidden="true">빽</span> 표식 있는 윷만 평평한 면이 위면 <strong>빽도 · 뒤로 1칸</strong></p><p className="yut-help">{myTurn ? '이동권 → 우리 말 → 빛나는 도착 칸을 골라요.' : '윷판의 칸을 눌러 위치 핑을 보낼 수 있어요.'}</p>
                <div className="yut-rolls" aria-label="모아 둔 이동권">{pub.rolls.map(roll => <button key={roll.id} disabled={!myTurn || busy} aria-pressed={activeRoll?.id === roll.id} onClick={() => { setRollId(roll.id); setSelected(-1) }}>
                  <StickResult mask={roll.mask} /><strong>{roll.name}</strong><small>{roll.steps === -1 ? '뒤로 1칸' : `앞으로 ${roll.steps}칸`}</small></button>)}</div>
                {!!destinations.length && <div className="yut-actions">{destinations.filter((move, i, all) => all.findIndex(value => value.to === move.to) === i).map(move => <button key={String(move.shortcut)} disabled={busy} onClick={() => void client.act({ type: 'MOVE', piece: selected, rollId: activeRoll!.id, shortcut: move.shortcut })}>{move.to === 30 ? '완주하기' : `${move.shortcut ? '지름길' : '기본 길'} · ${activeRoll!.steps === -1 ? '뒤로 1칸' : `${activeRoll!.steps}칸 이동`}${move.to === 20 ? ' · 참먹이' : ''}`}</button>)}</div>}
              </>}
          </section><RuleSummary rules={pub.rules} /><YutSocial client={client} log={pub.log} busy={busy} /></aside></div>
      </>}
  </dialog>
}

function YutSocial({ client, log, busy }: { client: YutClient; log: string[]; busy: boolean }) {
  const [chat, setChat] = useState('')
  return <section className="yut-social yut-paper"><h2>최근 진행 · 경기 채팅</h2><ol aria-live="polite">{log.slice(-6).map((line, i) => <li key={`${i}:${line}`}>{line}</li>)}</ol>
    <form onSubmit={event => { event.preventDefault(); if (!chat.trim() || busy) return; void client.feedback(chat.trim()).then(() => setChat('')) }}><label htmlFor="yut-chat">같은 경기 채팅</label><input id="yut-chat" value={chat} maxLength={100} onChange={event => setChat(event.target.value)} placeholder="함께하는 친구에게 한마디" /><button disabled={busy || !chat.trim()}>보내기</button></form>
  </section>
}

function RuleSummary({ rules }: { rules: YutRules }) {
  return <details className="yut-rules"><summary>우리 방 규칙</summary><p>말이 없을 때 빽도: {rules.emptyBackEnters ? '도 자리에 새 말' : '무효'}<br />윷·모 잡기: 추가 기회 {rules.doubleCaptureBonus ? '중복 적용' : '1회만 적용'}<br />참먹이 빽도: {rules.backHomeFinish ? '완주' : '실제 이동 경로로 한 칸 후퇴'}</p></details>
}
