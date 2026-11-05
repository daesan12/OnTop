import { GameHudClock, GameHudMenu } from '../GameHud'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTableLobby } from '../../features/tableLobby/state'
import { openManual } from '../../features/manual/manualState'
import { installDicePresentation, useDiceUI } from './controls'
import { setDiceSound, useDiceSound } from './sound'
import { farkleSpectatorStatus } from './spectatorStatus'
import { bustMatches } from './bustPresentation'
import { DiceFace } from './DiceFace'
import { FarkleScoreboard } from './FarkleScoreboard'
import './farkleSpectator.css'

/** Read-only: no player keys, cup gestures, selection or personal settlement controls. */
export function FarkleSpectatorPanel() {
  const s = useGame(), runtime = useParkRuntime()
  const [expanded, setExpanded] = useState(() => innerWidth >= 700 && innerHeight > 600)
  const [now,setNow]=useState(Date.now)
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[])
  useEffect(() => {
    const screen = matchMedia('(min-width: 700px) and (min-height: 601px)'), update = () => setExpanded(screen.matches)
    screen.addEventListener('change', update)
    return () => screen.removeEventListener('change', update)
  }, [])
  const session = useSession(useShallow(s => ({ status: s.status, pending: s.pending, profiles: s.profiles,
    anchor: s.bindings.find(b => b.channelId === s.roomId && b.tableId === s.watchedTableId)?.anchorId })))
  const view = useTableLobby(s => s.spectatorView), sound = useDiceSound(s => s.enabled)
  const until = useDiceUI(s => s.animationUntil), pendingBust = useDiceUI(s => s.bust), [, refresh] = useState(0)
  useEffect(installDicePresentation, [])
  useEffect(() => {
    if (until <= performance.now()) return
    const timer = setTimeout(() => refresh(n => n + 1), until - performance.now() + 1)
    return () => clearTimeout(timer)
  }, [until])
  const g = s.game?.dice && s.game.role === 'SPECTATOR' ? s.game : null
  if (!g) return null
  const d = g.dice, bust = bustMatches(g, pendingBust) ? pendingBust : null
  const rolling = d.status === 'PLAYING' && (bust ? bust.phase === 'rolling' : performance.now() < until)
  const names = d.players.map((id, i) => session.profiles[id]?.nickname ?? `${i + 1}번 참가자`)
  return <section className="farkle-observer-hud" role="region" aria-label="주사위 경기" data-stage={d.stage} data-rolling={rolling} data-view={view} onKeyDown={event => { if (event.code === 'Tab') event.stopPropagation() }}>
    {d.status==='PLAYING' && <GameHudClock game="주사위 한 판" label={`${names[d.players.indexOf(d.turnUserId!)]??'참가자'} 차례`} remainingMs={d.turnDeadline?Date.parse(d.turnDeadline)-now:null} hint="관전 중 · 공개 정보"/>}
    <FarkleScoreboard className="farkle-observer-scorebar" targetScore={d.targetScore} activeUserId={bust?.actorId ?? d.turnUserId}
      players={d.players.map((id, i) => ({ id, name: names[i]!, score: d.scores[i]!,
        forfeited: d.forfeitedUserIds?.includes(id),
        label: (bust?.actorId ?? d.turnUserId) === id ? names[i] + (bust ? ' · 굴림 확인' : ' 차례') : names[i]!,
      }))} />
    <details className="farkle-spectator" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><span>관전 정보</span><span className="farkle-observer-turn-total">이번 턴 <strong>{d.turnScore.toLocaleString()}</strong>점</span><i aria-hidden="true">⌄</i></summary>
      <div className="farkle-observer-body">
        <p className="farkle-observer-table">관전 중 · {d.round}번째 턴 · {session.anchor ? 'TABLE ' + session.anchor.replace('table-', '').padStart(2, '0') + ' · ' : ''}주사위 한 판</p>
        <p className={'farkle-spectator-status' + (d.lastEvent === 'BUST' ? ' bust' : '')} role="status">{bust
          ? bust.phase === 'rolling' ? '주사위를 굴리고 있습니다' : '허탕! · 이번 턴 점수 소멸. 다음 차례로 넘어갑니다.'
          : farkleSpectatorStatus(d, names, rolling)}</p>
        {(session.status !== 'connected' || s.uncertain) && <p role="status">연결 복구 중 · 마지막 공개 상태를 표시합니다</p>}
        {(['loose', 'held'] as const).map(kind => <div className="farkle-spectator-dice" key={kind} aria-label={kind === 'held' ? '보관한 주사위' : '이번 굴림'}>
          <small>{kind === 'held' ? '보관' : '이번 굴림'}</small>
          {d.dice.filter(die => die.held === (kind === 'held')).map(die => <span className="farkle-observer-die" key={die.id}
            aria-label={rolling && !die.held ? '굴리는 중' : '주사위 ' + (die.id + 1) + ': ' + die.value}>
            {rolling && !die.held ? <span className="farkle-observer-rolling">···</span> : <DiceFace value={die.value} />}</span>)}
          {!d.dice.some(die => die.held === (kind === 'held')) && <small>—</small>}
        </div>)}
        {s.error && <p role="alert">{s.error}</p>}
        <p className="farkle-spectator-note">관전자는 주사위를 선택하거나 굴릴 수 없습니다.</p>
      </div>
    </details>
    <GameHudMenu>
          <div className="farkle-spectator-views" role="group" aria-label="관전 시점">
            <button aria-pressed={view === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button>
            <button aria-pressed={view === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button>
          </div>
          <button onClick={() => openManual('farkle')}>게임 설명</button>
          <button aria-pressed={sound} onClick={() => setDiceSound(!sound)}>소리 {sound ? '켜짐' : '꺼짐'}</button>
          <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>상태 새로고침</button>
          <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>
    </GameHudMenu>
  </section>
}
