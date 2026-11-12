import type { StonePlayer } from './protocol'
type Candidate = Pick<StonePlayer, 'userId' | 'alive'>

export function nextSurvivor(players: readonly Candidate[], current: string | null, direction = 1): string | null {
  const start = players.findIndex(player => player.userId === current)
  if (start < 0) return (direction < 0 ? [...players].reverse() : players).find(player => player.alive)?.userId ?? null
  for (let step = 1; step <= players.length; step++) {
    const candidate = players[(start + direction * step + players.length * step) % players.length]!
    if (candidate.alive) return candidate.userId
  }
  return null
}

export function survivorView(players: readonly Candidate[], selected: string | null) {
  return players.some(player => player.userId === selected && player.alive) ? selected : nextSurvivor(players, selected)
}
