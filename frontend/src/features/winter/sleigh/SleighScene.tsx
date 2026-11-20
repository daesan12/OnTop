import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, type BufferGeometry } from 'three'
import { useSession } from '../../../network/worldClient'
import { useFacilityState } from '../../facilities/state'
import { createSleighArt, createReindeerLegArt } from './art'
import { SLEIGH_DOCK, SLEIGH_ID, sleighPose } from './route'
import { sleighElapsed } from './controller'
import { reindeerGallop } from './gallop'
import { sleighTeamPose } from './formation'
import { Reins } from './Reins'

function Art({ art }: { art: ReturnType<typeof createSleighArt> }) {
  return <>{Object.entries(art).map(([finish, geometry]) => <mesh key={finish} geometry={geometry as BufferGeometry}
    dispose={null} castShadow receiveShadow raycast={() => {}}>
    <meshStandardMaterial vertexColors roughness={finish === 'gold' ? .32 : .8} metalness={finish === 'gold' ? .55 : 0} />
  </mesh>)}</>
}
export function SleighScene() {
  const root = useRef<Group>(null), deer = useRef<Group>(null)
  const art = useMemo(() => ({ sleigh: createSleighArt(), deer: createSleighArt(true),
    upper: createReindeerLegArt(), lower: createReindeerLegArt(true) }), [])
  useEffect(() => () => { for (const set of Object.values(art)) for (const g of Object.values(set)) g.dispose() }, [art])
  useFrame(() => {
    if (!root.current) return
    const channel = useSession.getState().roomId
    const lease = Object.values(useFacilityState.getState().occupancies).find(l => l.facilityId === SLEIGH_ID && l.channelId === channel)
    const elapsed = lease ? sleighElapsed(lease) : 0
    const pose = lease ? sleighPose(elapsed) : SLEIGH_DOCK
    root.current.position.set(pose.x, pose.y, pose.z)
    root.current.rotation.y = pose.yaw
    deer.current?.children.forEach((animal, index) => {
      const stride = reindeerGallop(elapsed, index, 0)
      const row = Math.floor(index / 2), side = index % 2 ? .85 : -.85
      const path = sleighTeamPose(elapsed, [3.4, 5.9, 8.4][row]!, side)
      animal.position.set(path.x, path.y + (lease ? stride.lift : 0), path.z)
      animal.rotation.set(lease ? path.pitch + stride.pitch : 0, lease ? path.yaw : 0, lease ? path.bank : 0, 'YXZ')
      animal.children.forEach(node => {
        if (node.userData.leg === undefined) return
        const leg = reindeerGallop(elapsed, index, node.userData.leg)
        node.rotation.x = lease ? leg.hip : -.12
        node.children[1]!.rotation.x = lease ? leg.knee : .16
      })
    })
  }, -.5)
  return <group ref={root} name="winter-sleigh" position={[SLEIGH_DOCK.x, SLEIGH_DOCK.y, SLEIGH_DOCK.z]} rotation={[0, SLEIGH_DOCK.yaw, 0]}>
    <Art art={art.sleigh} />
    <Reins team={deer} />
    <group ref={deer} name="sleigh-reindeer-team">{[3.4, 5.9, 8.4].flatMap((z, row) => [-.85, .85].map((x, side) =>
      <group key={row + '-' + side} position={[x, 0, z]} name={row === 2 && side === 0 ? 'rudolph' : 'reindeer'}>
        <Art art={art.deer} />
        {[-.43, .44].flatMap((legZ, front) => [-.21, .21].map((legX, side) =>
          <group key={front + '-' + side} name="reindeer-leg" position={[legX, .18, legZ]} userData={{ leg: front * 2 + side }}>
            <group><Art art={art.upper} /></group>
            <group name="reindeer-knee" position={[0, -.44, 0]}><Art art={art.lower} /></group>
          </group>))}
        {row === 2 && side === 0 && <mesh position={[0, .97, 1.15]} raycast={() => {}}><icosahedronGeometry args={[.105, 1]} />
          <meshStandardMaterial color="#f1333e" emissive="#ed2135" emissiveIntensity={1.4} toneMapped={false} /></mesh>}
      </group>))}</group>
  </group>
}
