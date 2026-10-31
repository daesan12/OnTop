import { useGame } from '../game/store'
import { DEFEAT_DURATION, defeatTimeline } from '../game/presentation/defeat'
import { authoritativePose, useSession, type AvatarSnapshot } from '../network/worldClient'
import { TABLES } from '../park/mapConfig'

const anchors = new Map(TABLES.map(t => [t.id, t]))

/** Cancellation only. GAME_STATE/result/receipt never start a reaction. */
export function installGameReactions() {
  const game = useGame.subscribe((next, previous) => {
    if (next.game && previous.game && next.game.gameId !== previous.game.gameId)
      defeatTimeline.stopGame(previous.game.gameId)
  })
  const session = useSession.subscribe((next, previous) => {
    if (next.status !== 'connected' || !next.mapCompatible || next.sessionId !== previous.sessionId || next.roomId !== previous.roomId) {
      defeatTimeline.clear(); return
    }
    if (previous.watchedTableId && previous.watchedTableId !== next.watchedTableId)
      for (const [id, reaction] of defeatTimeline.playing)
        if (reaction.tableId === previous.watchedTableId) defeatTimeline.stop(id)
    if (previous.tableId && previous.tableId !== next.tableId) defeatTimeline.stop(previous.sessionId)
    for (const [tableId, before] of Object.entries(previous.tableStates)) {
      const after = next.tableStates[tableId]
      if (before.gameId && after?.gameId && before.gameId !== after.gameId)
        defeatTimeline.stopGame(before.gameId)
    }
  })
  return () => { game(); session(); defeatTimeline.clear() }
}

/** Public recipients need no GAME_WATCH/seat grant. Preserve their existing body pose. */
export function gameReaction(id: string, avatar: AvatarSnapshot, now: number) {
  const reaction = defeatTimeline.playing.get(id)
  if (!reaction) return null
  const session = useSession.getState(), position = authoritativePose(id), own = authoritativePose(session.sessionId)
  const anchor = anchors.get(reaction.anchorId)
  if (session.status !== 'connected' || !session.mapCompatible || session.roomId !== reaction.channelId
    || !avatar.connected || !position || !own || !anchor || avatar.moving || avatar.swimming || avatar.fitnessId || avatar.telescopeId || avatar.benchId
    || session.tableId !== reaction.tableId && Math.hypot(own.x - anchor.position[0], own.z - anchor.position[2]) > 20
    || !!avatar.tableId && avatar.tableId !== reaction.anchorId
    || Math.hypot(position.x - reaction.position.x, position.y - reaction.position.y, position.z - reaction.position.z) > .08
    || now - reaction.at >= DEFEAT_DURATION[reaction.kind]) {
    defeatTimeline.stop(id); return null
  }
  return now < reaction.at ? null : reaction
}
export const reactionFor = (id: string) => defeatTimeline.playing.get(id) ?? null
