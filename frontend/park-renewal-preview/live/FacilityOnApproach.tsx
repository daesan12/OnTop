import { startTransition, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { authoritativePose, useSession } from '../../src/network/worldClient'
import { welcomeFlight } from '../../src/features/welcomeTour/flight'
import type { Site } from '../plan'

const approachDistance = 44

export function FacilityOnApproach({ site, children, active = false }: {
  site: Pick<Site, 'id' | 'x' | 'z' | 'radius'>
  children: ReactNode
  active?: boolean
}) {
  const [ready, setReady] = useState(false)
  const requested = useRef(false)
  useFrame(() => {
    if (requested.current) return
    const pose = authoritativePose(useSession.getState().sessionId)
    if (!active && !welcomeFlight.active && (!pose || Math.hypot(pose.x - site.x, pose.z - site.z) > approachDistance + site.radius)) return
    requested.current = true
    performance.mark('park-facility-approach-' + site.id)
    startTransition(() => setReady(true))
  })
  return ready ? children : null
}
