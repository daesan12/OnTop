import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { authoritativePose, useSession } from '../../src/network/worldClient'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { welcomeFlight } from '../../src/features/welcomeTour/flight'
import { createLakeProgress, LakeStage } from '../lakeStages'
import { models } from '../modelUrls'
import { BRIDGE, DOCK_ACCESS, FISHING_SHOP, LAKE } from '../plan'

// Include the bridge approach, southern dock entrance and fishing shop.
const bounds = {
  west: BRIDGE.x0,
  east: LAKE.x + LAKE.rx,
  north: Math.min(LAKE.z - LAKE.rz, FISHING_SHOP.z),
  south: DOCK_ACCESS.points[0][1],
}
const prefetchDistance = 46
const displayDistance = 27
const courseBatchIntervalMs = 90
const modelUrls = [models.dock!, models.boat!]

export function LakeStreaming({ progress }: { progress: ReturnType<typeof createLakeProgress> }) {
  const stage = useSyncExternalStore(progress.subscribe, progress.getStage)
  const state = useRef({ frame: 0, commit: 0, committedAt: 0, nextModel: 0, requested: 0 })

  useLayoutEffect(() => {
    state.current.commit = state.current.frame
    state.current.committedAt = performance.now()
    if (stage > 0) performance.mark('park-lake-stage-' + stage)
  }, [stage])

  useFrame(({ camera }) => {
    const pending = state.current
    pending.frame++
    if (stage === LakeStage.Boats) return
    const { sessionId } = useSession.getState()
    const pose = authoritativePose(sessionId)
    if (!pose && !welcomeFlight.active) return
    const { x, z } = welcomeFlight.active ? camera.position : pose!
    const dx = Math.max(bounds.west - x, 0, x - bounds.east)
    const dz = Math.max(bounds.north - z, 0, z - bounds.south)
    const distance = Math.hypot(dx, dz)
    const { owner, run } = useJumpmap.getState()
    // Players can see the lake from high in the course, long before the ground
    // approach reaches the streaming boundary in the kite section.
    const courseApproach = owner === sessionId && !!run
    if (!courseApproach && distance > prefetchDistance && !welcomeFlight.active && stage === 0) return

    const url = modelUrls[pending.nextModel]
    if (url) {
      if (pending.nextModel === 0) performance.mark('park-lake-prefetch-start')
      useLoader.preload(ParkAssetLoader, url)
      pending.nextModel++
      return
    }
    if (!courseApproach && distance > displayDistance && !welcomeFlight.active && stage === 0) return
    // Wait for the previous React commit and leave a rendered frame between batches.
    if (pending.requested !== stage || pending.frame <= pending.commit + 1) return
    if (courseApproach && distance > displayDistance && performance.now() - pending.committedAt < courseBatchIntervalMs) return
    pending.requested++
    progress.advance()
  }, .7)
  return null
}
