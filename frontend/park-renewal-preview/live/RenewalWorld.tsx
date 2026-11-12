import { Buildings } from '../Buildings'
import { CityBackdrop } from '../CityBackdrop'
import { ParkDetailGeometry } from '../ParkDetailGeometry'
import { ScenicDetails } from '../ScenicDetails'
import { TableShell } from '../../src/features/tables/TableShell'
import { TABLES } from '../../src/park/mapConfig'
import { lazy, Suspense, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { avatars, useSession } from '../../src/network/worldClient'
import { horrorState, secretCorridorContains } from '../horrorPlan'

const HorrorZone = lazy(() => import('../HorrorZone').then(module => ({ default: module.HorrorZone })))

export default function RenewalWorld() {
  const surface = useRef<Group>(null), interior = useRef<Group>(null)
  const loadInterior = useRef(false)
  const [loaded, setLoaded] = useState(false)
  useFrame(({ camera, scene }) => {
    const own = avatars.get(useSession.getState().sessionId)
    const inside = !!own && secretCorridorContains(own.current)
    if (horrorState.open && !loadInterior.current) {
      loadInterior.current = true
      setLoaded(true)
    }
    const visible = inside && secretCorridorContains(camera.position)
      && !!interior.current?.getObjectByName('underground-horror-zone')
    if (surface.current) surface.current.visible = !visible
    if (interior.current) interior.current.visible = visible
    const daylight = scene.getObjectByName('renewal-exterior-lighting')
    if (daylight) daylight.visible = !visible
  }, .5)
  return <group name="renewal-220-world">
    <group ref={surface} name="renewal-park-surface">
      <CityBackdrop />
      <ScenicDetails />
      <Buildings live />
      {TABLES.map(anchor => <TableShell key={anchor.id} anchor={anchor} nativeFurniture={!!anchor.pavilionId} />)}
      <ParkDetailGeometry jumpCourse={false} />
    </group>
    <group ref={interior} name="renewal-secret-corridor" visible={false}>
      {loaded && <Suspense fallback={null}><HorrorZone /></Suspense>}
    </group>
  </group>
}
