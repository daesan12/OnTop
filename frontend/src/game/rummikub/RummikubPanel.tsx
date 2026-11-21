import { useEffect, useState } from 'react'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { OmokSurrender } from '../OmokSurrender'
import { openManual } from '../../features/manual/manualState'
import { RummikubTable } from './RummikubTable'
import { canActRummikub } from './actions'
import { COLOR_LABEL, type RummikubInput } from './protocol'
import { useRummikubPings } from './pings'
import { useOmokEvents } from '../omok/spectatorEvents'
import './rummikub.css'

export function RummikubPanel() {
  const s = useGame(), own = useSession(v => v.sessionId), profiles = useSession(v => v.profiles)
  const connection = useSession(v => v.status), runtime = useParkRuntime()
  const pings = useRummikubPings(), chats = useOmokEvents(v => v.history)
  const [chat, setChat] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer) }, [])
  useEffect(()=>{
    const focusChat=(event:FocusEvent)=>{
      if(!(event.target instanceof HTMLElement)||!event.target.closest('.park-chat'))return
      document.querySelectorAll<HTMLDetailsElement>('.rummikub-dock details[name="supae-dock"][open]').forEach(d=>{d.open=false})
    }
    document.addEventListener('focusin',focusChat)
    return()=>document.removeEventListener('focusin',focusChat)
  },[])
  const g = s.game?.rummikub ? s.game : null
  if (!g) return <section className="rummikub-panel rummikub-dock"><p>수패마루 상태를 확인하고 있습니다.</p><button onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const r = g.rummikub, player = g.role === 'PLAYER'
  const name = (id: string) => id === own ? '나' : profiles[id]?.nickname ?? `참가자 ${r.players.findIndex(p => p.userId === id) + 1}`
  const remaining = r.turnDeadline ? Math.min(r.turnTimeLimitMs / 1000, Math.max(0, Math.ceil((Date.parse(r.turnDeadline) - now) / 1000))) : null
  const canAct = connection === 'connected' && canActRummikub(own, { kind: 'draw' }, now)
  const send = (input: RummikubInput) => { void runtime.actRummikub?.(input) }
  const status = r.status === 'FINISHED' ? `${r.endReason === 'EMPTY_HAND' ? '수패마루! · ' : ''}${r.winnerUserIds.map(name).join(' · ')} 승리`
    : r.turnUserId === own && player ? `내 차례 · ${remaining}초` : `${name(r.turnUserId!)} 차례 · ${remaining}초`
  const me = r.players.find(p => p.userId === own)
  return <section className="rummikub-panel rummikub-dock" aria-label="수패마루" onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation()
    if(e.key==='Escape') { const drawer=e.currentTarget.querySelector<HTMLDetailsElement>('details[name="supae-dock"][open]');if(drawer){e.preventDefault();drawer.open=false} }
  }}>
    <header className="rummi-header"><h2>수패마루</h2><strong role="status">{status}</strong>
      <span>{me?.registered ? '등록 완료' : '첫 등록 30점'}</span><span>더미 {r.poolCount}개</span>
      <div className="rummi-player-counts">{r.players.map(p=><span key={p.userId} data-turn={p.userId===r.turnUserId}>{name(p.userId)} {p.forfeited ? '기권' : `${p.tileCount}개`}</span>)}</div>
      <button onClick={() => openManual('rummikub')}>게임 설명</button>
      {player ? <OmokSurrender context={{ userId: own, gameId: g.gameId, version: g.version }} disabled={s.pending}/>
        : <button onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
    </header>
    <details name="supae-dock" className="rummi-match-details"><summary>경기 정보</summary><div className="rummi-drawer">
    <button className="rummi-drawer-close" onClick={e=>{const details=e.currentTarget.closest('details');if(details)details.open=false}}>경기 정보 닫기</button>
    <details className="rummi-social"><summary>선공 추첨 · {name(r.firstUserId)} 선공</summary>
      <p>{r.openingDraws.map(d => `${name(d.userId)}: ${d.color === null ? '조커' : `${COLOR_LABEL[d.color]} ${d.number}`}`).join(' · ')}</p>
      <p>조커가 가장 높아요. 최고 숫자가 같으면 동점자 중 무작위로 정해요. 추첨 타일은 돌려놓고 다시 섞었어요.</p>
    </details>
    {r.status === 'PLAYING' && r.poolCount === 0 && <p role="status">더미 소진 · 마지막 한 차례가 남은 참가자: {r.finalTurnUserIds.map(name).join(' · ')}</p>}
    <div className="rummi-opponents">{r.players.map(p => <div key={p.userId} data-turn={p.userId === r.turnUserId}>
      <strong>{name(p.userId)}</strong><span>{p.forfeited ? '기권' : `${p.tileCount}개`}</span><small>{p.registered ? '등록 완료' : '미등록'}</small>
      {p.score !== null && <b>{p.score > 0 ? '+' : ''}{p.score}점</b>}
    </div>)}</div>
    <details className="rummi-social"><summary>경기 채팅 · 관전 핑</summary>
      <ol>{chats.filter(c => c.gameId === g.gameId).slice(-10).map(c => <li key={c.eventId}>{profiles[c.senderUserId]?.nickname ?? '참가자'} · {c.text}</li>)}</ol>
      {pings.pings.map(p => <p key={p.eventId}>{profiles[p.senderUserId]?.nickname ?? '관전자'} · {p.meldIndex + 1}번 조합 주목</p>)}
      {pings.error && <p role="alert">{pings.error}</p>}
      <form onSubmit={e => { e.preventDefault(); if (chat.trim()) void runtime.sendSpectatorChat(chat).then(ok => { if (ok) setChat('') }) }}>
        <label>경기 메시지 <input value={chat} maxLength={200} onChange={e => setChat(e.target.value)}/></label><button type="submit" disabled={!chat.trim() || r.status !== 'PLAYING'}>보내기</button>
      </form>
    </details>
    <div className="rummi-recovery"><button disabled={s.pending || connection !== 'connected'} onClick={() => void runtime.checkGame()}>최신 상태 확인</button>
      {player && r.status === 'FINISHED' && <><p>{s.result?.settlementStatus === 'SETTLED' ? `정산 완료 · ${s.result.myCoinDelta ?? 0}냥` : '게임 점수와 엽전 정산은 별도입니다. 서버 정산 확인 중입니다.'}</p>
        <button onClick={() => void runtime.checkResult()}>정산 결과 확인</button></>}
    </div>
    </div></details>
    <RummikubTable key={`${g.gameId}:${g.version}`} state={r} own={own} tiles={g.rummikubHand?.tiles ?? []}
      tabletop editable={canAct} sending={s.pending} error={s.error}
      notice={s.uncertain ? '반영 여부가 불명확합니다. 최신 상태 확인 후 진행하세요.' : connection !== 'connected' ? '연결 복구 중 · 입력이 잠겼습니다.'
        : g.version < s.awaitingVersion ? '처리 확인 수신 · 최신 타일 상태를 기다리고 있습니다.' : !player ? '관전 중 · 개인 손패는 공개되지 않습니다.' : undefined}
      onPing={!player && pings.canSend ? index => { void runtime.pingRummikub?.(index) } : undefined}
      pingIndices={pings.pings.map(p => p.meldIndex)}
      onDraw={() => send({ kind: 'draw' })} onPlay={melds => send({ kind: 'play', melds })}/>
  </section>
}
