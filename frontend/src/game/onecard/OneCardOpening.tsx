import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import type { TableAnchor } from '../../config'
import { tableScale, tableSeats } from '../../config'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { useGame } from '../store'
import { dealArrival, DEAL_FLIGHT_MS, SHUFFLE_MS, openingAge, openingDuration } from './opening'
import { CardBody } from './OneCardBoard'
import { useReducedMotion } from './useReducedMotion'

/** Public backs only: a short shuffle, then seven clockwise rounds into the actual hands. */
export function OneCardOpening({ anchor, surfaceY }: { anchor: TableAnchor; surfaceY: number }) {
  const root = useRef<Group>(null), target = useRef(new Vector3()), reduced = useReducedMotion()
  useFrame(({ scene }) => {
    const group = root.current, game = useGame.getState().game
    if (!group || !game?.onecard) return
    const state = game.onecard, age = openingAge(state, game.version, estimatedServerTime())
    group.visible = !reduced && age < openingDuration(state.players.length)
    group.userData.phase = group.visible ? age < SHUFFLE_MS ? 'shuffle' : 'deal' : 'complete'
    if (!group.visible) return
    for (let index = 0; index < group.children.length; index++) {
      const card = group.children[index]!
      if (index < 6) {
        card.visible = age < SHUFFLE_MS
        card.position.set(-.28 + Math.sin(age / 65 + index * Math.PI) * .13, surfaceY + .07 + index * .012, 0)
        card.rotation.set(0, Math.sin(age / 85 + index) * .1, 0)
        continue
      }
      const slot = index - 6, seat = slot % state.players.length, round = Math.floor(slot / state.players.length)
      const player = state.players[seat]!, arrival = dealArrival(round, seat, state.players.length)
      const t = (age - (arrival - DEAL_FLIGHT_MS)) / DEAL_FLIGHT_MS
      card.visible = round < 7 && t >= 0 && t < 1
      if (!card.visible) continue
      const held = scene.getObjectByName(`onecard-held-hand-${player.userId}`)
      if (held) { held.getWorldPosition(target.current); group.worldToLocal(target.current) }
      else {
        const position = tableSeats(anchor)[avatars.get(player.userId)?.seatIndex ?? seat] ?? tableSeats(anchor)[0]!
        target.current.set(position.x / tableScale(anchor) * .65, surfaceY + .35, position.z / tableScale(anchor) * .65)
      }
      const ease = 1 - (1 - t) ** 2
      card.position.set(-.28 + (target.current.x + .28) * ease,
        surfaceY + .08 + (target.current.y - surfaceY - .08) * ease + Math.sin(t * Math.PI) * .22, target.current.z * ease)
      card.rotation.set(-t * .7, 0, 0)
    }
  })
  return <group ref={root} name="onecard-opening" visible={false} dispose={null}>
    {Array.from({ length: 34 }, (_, index) => <group key={index} scale={[.9, 1, .9]}><CardBody back /></group>)}
  </group>
}
