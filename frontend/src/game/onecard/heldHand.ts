import type { createCharacterRig } from '../../world/art/CharacterRig'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'

/** Public card counts only, scoped to the actual table being played or watched. */
export function oneCardHeldCount(userId: string, anchorId: string) {
  const game = useGame.getState().game, session = useSession.getState()
  if (game?.onecard?.status !== 'PLAYING' || !anchorId) return 0
  const tableId = game.role === 'PLAYER' ? session.tableId : session.watchedTableId
  if (!session.bindings.some(b => b.channelId === session.roomId && b.anchorId === anchorId && b.tableId === tableId)) return 0
  const player = game.onecard.players.find(p => p.userId === userId)
  return player?.active ? player.cardCount : 0
}

/** The game supplies its own presentation pose through the avatar motion extension point. */
export function oneCardHoldingPose(model: ReturnType<typeof createCharacterRig>) {
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    model.reachFitnessHand(side, sign * .115, .96, .36, -.3, 0, sign * -.15)
    model.handPose(side, 'cup')
  }
}
