import { HudCorners, PlayerSeal } from './FarkleHudArt'

/** One visual scorebar for participants and public spectators; labels stay role-specific. */
export function FarkleScoreboard({ players, activeUserId, targetScore, className = '' }: {
  players: readonly { id: string; name: string; label: string; score: number }[]
  activeUserId: string | null | undefined; targetScore: number; className?: string
}) {
  return <div className={'farkle-scoreboard ' + className} aria-label="주사위 점수판"><HudCorners />
    {players.map(player => <div key={player.id} className={'farkle-player-score' + (activeUserId === player.id ? ' active' : '')}
      aria-label={player.name + ' 저장 점수'}>
      <PlayerSeal active={activeUserId === player.id} />
      <span className="farkle-player-name" title={player.label}>{player.label}</span>
      <strong>{player.score.toLocaleString()}<small>점</small></strong>
      <progress max={targetScore} value={player.score} aria-label={player.name + ' 총점'} />
    </div>)}
    <span className="farkle-goal">목표 점수<strong>{targetScore.toLocaleString()}</strong></span>
  </div>
}
