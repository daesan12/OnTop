// Dev-server-only inspection. No production import, network command or animation trigger.
import { _roots } from '@react-three/fiber'
import { Vector3 } from 'three'
import { reactionFor } from '../../src/world/gameReactions'
import { avatars, estimatedServerTime } from '../../src/network/worldClient'

export function defeatProbe(id = '101') {
  const root = [..._roots.values()][0]!.store.getState(), object = root.scene.getObjectByName('avatar-' + id)
  const model = object?.getObjectByName('character-model'), head = model?.getObjectByName('head')
  const position = (name: string) => model?.getObjectByName(name)?.getWorldPosition(new Vector3()).toArray()
  const reaction = reactionFor(id), avatar = avatars.get(id)
  return { reaction, age: reaction ? estimatedServerTime() - reaction.at : null,
    visible: object?.visible, headPitch: head?.rotation.x, head: position('head'), left: position('hand_L'), right: position('hand_R'),
    leg: model?.getObjectByName('upperLeg_L')?.rotation.x, character: object?.userData.character,
    avatar: avatar && { tableId: avatar.tableId, seatIndex: avatar.seatIndex, emote: avatar.emote },
    memory: { ...root.gl.info.memory } }
}
