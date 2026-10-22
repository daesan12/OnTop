import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group } from 'three'
import { TelescopeModel, TelescopeReflectionLighting } from './TelescopeModel'
import { TELESCOPES, TELESCOPE, type Telescope } from '../../config'
import { avatars, useSession } from '../../network/worldClient'
import { telescopeView } from '../../features/telescopeView'

function ObservationTelescope({ telescope: t }: { telescope: Telescope }) {
  const root = useRef<Group>(null),
    swivel = useRef<Group>(null),
    head = useRef<Group>(null)
  useFrame((_state, delta) => {
    const session = useSession.getState()
    const own = session.status === 'connected' && session.telescopeId === t.id
    root.current!.visible = !own
    let owner
    for (const a of avatars.values()) {
      if (a.telescopeId === t.id) {
        owner = a
        break
      }
    }
    const yaw = own ? telescopeView.yaw : (owner?.telescopeYaw ?? t.yaw)
    const pitch = own
      ? telescopeView.pitch
      : (owner?.telescopePitch ?? TELESCOPE.initialPitch)
    const difference = Math.atan2(
      Math.sin(yaw - swivel.current!.rotation.y),
      Math.cos(yaw - swivel.current!.rotation.y),
    )
    const blend = 1 - Math.exp(-12 * delta)
    swivel.current!.rotation.y += difference * blend
    head.current!.rotation.x += (-pitch - head.current!.rotation.x) * blend
  })
  return (
    <group ref={root} name={t.id} position={t.position} dispose={null}>
      <TelescopeModel part="base" />
      <group ref={swivel} rotation={[0, t.yaw, 0]}>
        <TelescopeModel part="yoke" />
        <group
          ref={head}
          position={[0, TELESCOPE.eyeHeight, 0]}
          rotation={[-TELESCOPE.initialPitch, 0, 0]}
        >
          <TelescopeModel part="head" />
        </group>
      </group>
    </group>
  )
}
export function ObservationTelescopes() {
  return (
    <group name="observation-telescopes">
      <TelescopeReflectionLighting />
      {TELESCOPES.map((t) => (
        <ObservationTelescope key={t.id} telescope={t} />
      ))}
    </group>
  )
}
