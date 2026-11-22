import { WINTER_DECOR } from '../winter/plan'
import { renewalGroundHeight } from '../../park/renewalMap'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { useCompanions } from './companions'
import { parkDialogues, type ParkSpeaker } from './parkDialogue'

type Point = { x: number; y: number; z: number }
export type ParkNpcTarget = Point & { id: string; speaker: ParkSpeaker; name: string }
const residents: Record<string, ParkSpeaker> = { '박영감': 'elder', '윤한수': 'hansu', '강잼민': 'child' }

export function nearbyParkNpcs(pose: Point, channel: string, now = performance.now()): ParkNpcTarget[] {
  const targets: ParkNpcTarget[] = []
  if (RENEWAL_PARK_ENABLED) for (const prop of WINTER_DECOR) {
    if (prop.id !== 'plaza-snowman' && prop.id !== 'santa') continue
    const speaker = prop.id === 'santa' ? 'santa' : 'snowman'
    targets.push({ id: prop.id, speaker, name: parkDialogues[speaker].name,
      x: prop.x, y: renewalGroundHeight(prop.x, prop.z) + .8, z: prop.z })
  }
  const state = useCompanions.getState()
  if (now - state.actorReceivedAt < 5000) for (const actor of state.actors) {
    const speaker = residents[actor.name]
    if (!speaker || actor.channelId !== channel || actor.role === 'OPPONENT') continue
    targets.push({ id: actor.id, speaker, name: actor.name, x: actor.x, y: actor.y, z: actor.z })
  }
  return targets.filter(npc => Math.hypot(pose.x - npc.x, pose.z - npc.z) <= 3.2 && Math.abs(pose.y - npc.y) <= 2.4)
}
