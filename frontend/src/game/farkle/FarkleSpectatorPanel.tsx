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

/** Read-only: no player keys, cup gestures, selection or personal settlement controls. */
export function FarkleSpectatorPanel() {
  const s = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ status: s.status, pending: s.pending, profiles: s.profiles,
    anchor: s.bindings.find(b => b.channelId === s.roomId && b.tableId === s.watchedTableId)?.anchorId })))
  const view = useTableLobby(s => s.spectatorView), sound = useDiceSound(s => s.enabled)
  const until = useDiceUI(s => s.animationUntil), [, refresh] = useState(0)
  useEffect(installDicePresentation, [])
  useEffect(() => {
    if (until <= performance.now()) return
    const timer = setTimeout(() => refresh(n => n + 1), until - performance.now() + 1)
    return () => clearTimeout(timer)
  }, [until])
  const g = s.game?.dice && s.game.role === 'SPECTATOR' ? s.game : null
  if (!g) return null
  const d = g.dice, rolling = d.status === 'PLAYING' && performance.now() < until
  const names = d.players.map((id, i) => session.profiles[id]?.nickname ?? `${i + 1}번 참가자`)
  return <aside className="farkle-panel farkle-spectator" role="region" aria-label="주사위 경기" data-stage={d.stage} data-rolling={rolling}>
    <header><div><small>{session.anchor ? `TABLE ${session.anchor.replace('table-', '').padStart(2, '0')} · ` : ''}관전 전용</small>
      <h2>주사위 한 판</h2></div><span>목표 {d.targetScore.toLocaleString()}점</span></header>
    <div className="farkle-observer-scores" aria-label="주사위 점수판">{d.players.map((id, i) => <div key={id} className={id === d.turnUserId ? 'active' : ''}>
      <span>{names[i]}</span><strong>{d.scores[i]!.toLocaleString()}점</strong></div>)}</div>
    <p className={`farkle-spectator-status${d.lastEvent === 'BUST' ? ' bust' : ''}`} role="status">{farkleSpectatorStatus(d, names, rolling)}</p>
    {(session.status !== 'connected' || s.uncertain) && <p role="status">연결 복구 중 · 마지막 공개 상태를 표시합니다</p>}
    <p className="farkle-spectator-turn">{d.round}번째 턴 · 이번 턴 <strong>{d.turnScore.toLocaleString()}점</strong></p>
    {(['loose', 'held'] as const).map(kind => <div className="farkle-spectator-dice" key={kind} aria-label={kind === 'held' ? '보관한 주사위' : '이번 굴림'}>
      <small>{kind === 'held' ? '보관' : '이번 굴림'}</small>
      {d.dice.filter(die => die.held === (kind === 'held')).map(die => <span key={die.id}
        aria-label={rolling && !die.held ? '굴리는 중' : `주사위 ${die.id + 1}: ${die.value}`}>
        {rolling && !die.held ? '·' : '⚀⚁⚂⚃⚄⚅'[die.value - 1]}</span>)}
      {!d.dice.some(die => die.held === (kind === 'held')) && <small>—</small>}
    </div>)}
    <p className="farkle-spectator-note">관전자는 주사위를 선택하거나 굴릴 수 없습니다.</p>
    {s.error && <p role="alert">{s.error}</p>}
    <footer>
      <div className="farkle-spectator-views" role="group" aria-label="관전 시점">
        <button aria-pressed={view === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button>
        <button aria-pressed={view === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button>
      </div>
      <button onClick={() => openManual('farkle')}>게임 설명</button>
      <button aria-pressed={sound} onClick={() => setDiceSound(!sound)}>소리 {sound ? '켜짐' : '꺼짐'}</button>
      <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 주사위 확인</button>
      <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>
    </footer>
  </aside>
}
