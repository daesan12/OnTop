import { useGame } from '../game/store'
import { DEFEAT_DURATION, DefeatTimeline } from '../game/presentation/defeat'
import { estimatedServerTime, useSession, type AvatarSnapshot } from '../network/worldClient'

const timeline = new DefeatTimeline()
let anchorId = '', channelId = ''
const clear = () => { timeline.clear(); anchorId = ''; channelId = '' }

/** Visible match participants/public observers only; no new socket or fabricated world event. */
export function installGameReactions() {
  clear()
  const game = useGame.subscribe((next, previous) => {
    if (next.game === previous.game) return
    const session = useSession.getState(), g = next.game
    const tableId = g?.role === 'SPECTATOR' ? session.watchedTableId : session.tableId
    const anchor = session.bindings.find(b => b.channelId === session.roomId && b.tableId === tableId)?.anchorId
    if (session.status !== 'connected' || !session.mapCompatible || !anchor || !g) { clear(); return }
    if (channelId !== session.roomId || anchorId !== anchor) { clear(); channelId = session.roomId; anchorId = anchor }
    timeline.observe(previous.game, g, estimatedServerTime())
  })
  const session = useSession.subscribe((next, previous) => {
    if (next.status !== 'connected' || !next.mapCompatible || next.sessionId !== previous.sessionId || next.roomId !== previous.roomId) clear()
  })
  return () => { game(); session(); clear() }
}

/** Read during the existing pose tick. Leaving/moving cancels; no per-frame React state. */
export function gameReaction(id: string, avatar: AvatarSnapshot, now: number) {
  const reaction = timeline.playing.get(id)
  if (!reaction) return null
  if (useSession.getState().roomId !== channelId || !avatar.connected || avatar.tableId !== anchorId
    || avatar.seatIndex < 0 || avatar.moving || avatar.swimming || avatar.fitnessId || avatar.telescopeId || avatar.benchId
    || now - reaction.at >= DEFEAT_DURATION[reaction.kind]) {
    timeline.stop(id); return null
  }
  return now < reaction.at ? null : reaction
}

// Read-only inspection for the existing dev-server test probe; not a network contract.
export const reactionFor = (id: string) => timeline.playing.get(id) ?? null
