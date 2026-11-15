import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../network/worldClient'
import { displayNickname } from '../features/gameMaster/displayName'
import { useGame } from './store'
import { gameState } from './protocol'
import './gameSpectatorCount.css'

export function GameSpectatorCount() {
  const gameId = useGame(s => s.game && gameState(s.game)?.status === 'PLAYING' ? s.game.gameId : null)
  const watchers = useSession(useShallow(s => {
    if (!gameId) return []
    return Object.entries(s.gameWatches).filter(([, watch]) => watch.gameId === gameId).map(([userId]) => {
      const profile = s.profiles[userId]
      return profile?.nicknameKnown === false || !profile?.nickname.trim() ? '' : displayNickname(profile, '')
    })
  }))
  if (!gameId) return null
  return <GameSpectatorBadge key={gameId} count={watchers.length} names={watchers.filter(Boolean)} />
}

export function GameSpectatorBadge({ count, names }: { count: number; names?: string[] }) {
  const formatted = new Intl.NumberFormat('ko-KR').format(count)
  const label = `현재 관전자 ${formatted}명`
  const badge = <>
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.6"/></svg>
    <span key={count} className="game-spectator-number">{formatted}<small>명 관전 중</small></span>
  </>
  if (count === 0 || !names) return <span className="game-spectator-count" role="status" aria-live="polite" aria-atomic="true" aria-label={label}>{badge}</span>
  return <div className="game-spectator-count">
    <details className="game-spectator-disclosure">
      <summary aria-label={`${label}, 닉네임 목록`} onKeyDown={event => {
        if (event.key === 'Enter') event.stopPropagation()
      }}>
        {badge}
        <small className="game-spectator-preview">{names.length ? names.slice(0, 2).join(' · ') : '닉네임 확인 중'}</small>
        <svg className="game-spectator-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
      </summary>
      <div className="game-spectator-roster" role="region" aria-label="관전자 목록" tabIndex={0}>
        {names.length > 0 && <ul aria-label="관전자 닉네임">{names.map((name, index) => <li key={index}>{name}</li>)}</ul>}
        {names.length < count && <small>닉네임 확인 중 {count - names.length}명</small>}
      </div>
    </details>
  </div>
}
