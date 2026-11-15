import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Vector3, type Group } from 'three'
import { BALLOON_DOCK_OFFSET, BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { useSession } from '../../network/worldClient'
import type { Point } from './flight'
import { useLocalBalloon } from './localRide'
import { sampleRemoteBalloon, useRemoteBalloons } from './remoteRide'

type DockBounds = { group: Group; origin: Vector3; size: Vector3 }

function overlapsDock(position: Point, { origin, size }: DockBounds) {
  // Both models use the same scale and orientation, so their bounds differ only by translation.
  return Math.abs(position.x - origin.x) <= size.x
    && Math.abs(position.y - origin.y) <= size.y
    && Math.abs(position.z - origin.z) <= size.z
}

export function DockedBalloon({ children, trackFlights }: { children: ReactNode; trackFlights: boolean }) {
  const root = useRef<Group>(null)
  const bounds = useRef<DockBounds | null>(null)

  useFrame(() => {
    const group = root.current
    if (!trackFlights || !group) return
    if (bounds.current?.group !== group) {
      const box = new Box3().setFromObject(group)
      if (box.isEmpty()) return
      bounds.current = { group, origin: group.getWorldPosition(new Vector3()), size: box.getSize(new Vector3()) }
    }

    const dock = bounds.current
    const { owner, leader, flight } = useLocalBalloon.getState()
    const self = useSession.getState().sessionId
    const now = performance.now()
    const localOverlap = flight && owner === leader && overlapsDock(flight.position, dock)
    group.visible = !localOverlap && !Object.keys(useRemoteBalloons.getState().flights).some(pilot => {
      if (pilot === self) return false
      const position = sampleRemoteBalloon(pilot, now)
      return position !== null && overlapsDock(position, dock)
    })
  }, -1.6)

  return <group ref={root} name="docked-balloon" position={BALLOON_DOCK_OFFSET}
    scale={BALLOON_SCALE} visible={!trackFlights}>
    {children}
  </group>
}
