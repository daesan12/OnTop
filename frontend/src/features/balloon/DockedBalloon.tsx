import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Mesh, Vector3, type Group } from 'three'
import { BALLOON_DOCK_OFFSET, BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { useSession } from '../../network/worldClient'
import type { Point } from './flight'
import { useLocalBalloon } from './localRide'
import { sampleRemoteBalloon, useRemoteBalloons } from './remoteRide'

type DockBounds = { group: Group; origin: Vector3; sections: Box3[] }

const basketTop = 2 * BALLOON_SCALE
const envelopeBottom = 5 * BALLOON_SCALE
const offset = new Vector3()
const movingBounds = new Box3()

function measureDockBounds(group: Group): DockBounds {
  group.updateWorldMatrix(true, true)
  const origin = new Vector3().setFromMatrixPosition(group.matrixWorld)
  const basket = new Box3(), suspension = new Box3(), envelope = new Box3()
  const corners = [new Vector3(), new Vector3(), new Vector3()] as const

  group.traverse(object => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.getAttribute('position')
    if (!positions) return
    const indices = object.geometry.getIndex()
    const count = indices?.count ?? positions.count
    for (let i = 0; i + 2 < count; i += 3) {
      corners.forEach((corner, j) => {
        corner.fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(object.matrixWorld)
      })
      const [a, b, c] = corners
      // The asset batches these parts into one mesh. Keep each triangle intact when grouping by height.
      const top = Math.max(a.y, b.y, c.y) - origin.y
      const bottom = Math.min(a.y, b.y, c.y) - origin.y
      const section = top <= basketTop ? basket : bottom >= envelopeBottom ? envelope : suspension
      section.expandByPoint(a).expandByPoint(b).expandByPoint(c)
    }
  })

  return { group, origin, sections: [basket, suspension, envelope].filter(section => !section.isEmpty()) }
}

function overlapsDock(position: Point, { origin, sections }: DockBounds) {
  offset.set(position.x, position.y, position.z).sub(origin)
  return sections.some(section => {
    movingBounds.copy(section).translate(offset)
    return sections.some(docked => docked.intersectsBox(movingBounds))
  })
}

export function DockedBalloon({ children, trackFlights }: { children: ReactNode; trackFlights: boolean }) {
  const root = useRef<Group>(null)
  const bounds = useRef<DockBounds | null>(null)

  useFrame(() => {
    const group = root.current
    if (!trackFlights || !group) return
    if (bounds.current?.group !== group) {
      const measured = measureDockBounds(group)
      if (!measured.sections.length) return
      bounds.current = measured
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
