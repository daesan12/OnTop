import { useGame } from '../../game/store'
import { useBungeoppang } from '../bungeoppang/store'
import { gameBlocksParkMap } from '../navigation/mapAccess'

export const tableGameplayActive = (s = useGame.getState()) =>
  !!s.watchedGameId || s.game?.role === 'SPECTATOR'
  || gameBlocksParkMap(s.game, s.start?.phase)
  || s.start?.phase === 'SETTLING'
  || s.recovery === 'PENDING'

export const gameplayMenusLocked = () => tableGameplayActive() || useBungeoppang.getState().phase !== 'idle'

export function useGameplayMenusLocked() {
  const table = useGame(tableGameplayActive)
  const minigame = useBungeoppang(s => s.phase !== 'idle')
  return table || minigame
}
