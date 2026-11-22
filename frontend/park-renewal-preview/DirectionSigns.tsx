import { useMemo } from 'react'
import { Mesh } from 'three'
import { renewalMap } from '../src/park/renewalMap'
import { factory } from './assetFactories'
import { SIGNPOSTS } from './landscapePlan'
import { heightAt } from './plan'
import { orientWayfinding } from './wayfindingArt'
import { FacilityOnApproach } from './live/FacilityOnApproach'

const spawn = renewalMap?.data.physics.spawn.position
const entranceSigns = new Set(SIGNPOSTS.filter(sign => spawn && Math.hypot(sign.x - spawn[0], sign.z - spawn[2]) <= 20))
type Sign = typeof SIGNPOSTS[number]

function DirectionSign({ sign, index, entrance = false }: { sign: Sign; index: number; entrance?: boolean }) {
  const group = useMemo(() => {
    const object = orientWayfinding(factory('sign', sign.boards.length === 3
      ? { variant: 'crossroads', destinations: sign.boards.map(board => ({ label: board.label, direction: 'right' })) }
      : { variant: 'wood-arrow', label: sign.boards[0]!.label, direction: 'right' }), sign)
    // Even off-camera entrance labels warm the same program used by distant signs.
    if (entrance) object.traverse(node => { if (node instanceof Mesh) node.userData.prepareEntranceProgram = true })
    return object
  }, [sign, entrance])
  return <group name={'advance-wayfinding-' + index} userData={{ boards: sign.boards }}
    position={[sign.x, heightAt(sign.x, sign.z), sign.z]}><primitive object={group} dispose={null} /></group>
}

export function EntranceDirectionSigns() {
  return <>{SIGNPOSTS.map((sign, index) => entranceSigns.has(sign)
    ? <DirectionSign key={index} sign={sign} index={index} entrance /> : null)}</>
}

export function DirectionSigns({ live }: { live: boolean }) {
  return <>{SIGNPOSTS.map((sign, index) => {
    if (live && entranceSigns.has(sign)) return null
    const model = <DirectionSign sign={sign} index={index} />
    return live ? <FacilityOnApproach key={index} site={{ id: 'wayfinding-' + index, x: sign.x, z: sign.z, radius: 0 }}>
      {model}
    </FacilityOnApproach> : <DirectionSign key={index} sign={sign} index={index} />
  })}</>
}
