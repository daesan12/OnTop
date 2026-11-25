import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { pigeonGeometry, pigeonMaterial } from '../../world/pigeons/pigeonGeometry'
import { StoneRenderClock } from './motion'
import { StonePigeonFlights, sampleStonePigeon } from './pigeonFlight'
import type { StoneState } from './protocol'
import { createStoneMaterial } from './visibility'

const material = createStoneMaterial(pigeonMaterial)
const slots = Array.from({ length: 16 }, (_, index) => index)

function Pigeon({ index, flights, time }: {
  index: number; flights: StonePigeonFlights; time: MutableRefObject<number>
}) {
  const root = useRef<Group>(null), left = useRef<Group>(null), right = useRef<Group>(null)
  useFrame(() => {
    const group = root.current, flight = flights.current[index]
    if (!group) return
    group.visible = !!flight && sampleStonePigeon(flight, time.current, group.position)
    if (!group.visible || !flight) return
    group.userData.stonePigeonId = flight.pigeon.id
    group.rotation.y = Math.atan2(flight.pigeon.vx, flight.pigeon.vz)
    const angle = .2 + Math.sin((time.current - flight.bornAt) * .038) * .85
    if (left.current) left.current.rotation.z = -angle
    if (right.current) right.current.rotation.z = angle
  })
  return <group name={`stone-pigeon-slot-${index}`} ref={root} visible={false} scale={3.3} userData={{ prepareWhenHidden: true }}>
    <mesh geometry={pigeonGeometry.body} material={material} />
    <mesh geometry={pigeonGeometry.head} material={material} position={[0, .187, .064]} />
    <group ref={left} position={[-.062, .18, .005]}><mesh geometry={pigeonGeometry.leftWing} material={material} /></group>
    <group ref={right} position={[.062, .18, .005]}><mesh geometry={pigeonGeometry.rightWing} material={material} /></group>
  </group>
}

export function StonePigeons({ state }: { state: StoneState }) {
  const flights = useMemo(() => new StonePigeonFlights(), [])
  const clock = useMemo(() => new StoneRenderClock(), [])
  const time = useRef(state.serverTime)
  useLayoutEffect(() => { flights.accept(state) }, [flights, state])
  useFrame(() => { time.current = clock.sample(state.serverTime, performance.now()) }, -1)
  return <group name="stone-pigeons">{slots.map(index => <Pigeon key={index} index={index} flights={flights} time={time} />)}</group>
}
