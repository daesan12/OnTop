import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { flightPose, type TilePose } from './layout'

/** 좌표만 보간한다. 패 크기·숫자·게임 판정은 바꾸지 않는다. */
export function TileMotion({ pose, from, children, name, tileId, userId }: {
  pose: TilePose; from?: TilePose; children: ReactNode; name: string; tileId: string; userId?: string
}) {
  const root = useRef<Group>(null), born = useRef(performance.now()), initial = useRef(from)
  const reduce = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  useLayoutEffect(() => {
    const p = initial.current ?? pose
    root.current!.position.set(p.x, p.y, p.z); root.current!.rotation.set(p.tilt, p.yaw, 0, 'YXZ')
  }, [])
  useFrame((_, delta) => {
    const node = root.current; if (!node) return
    if (initial.current && performance.now() - born.current < 380 && !reduce.current) {
      const p = flightPose(initial.current, pose, (performance.now() - born.current) / 380)
      node.position.set(p.x, p.y, p.z); node.rotation.set(p.tilt, p.yaw, 0, 'YXZ')
    } else {
      const alpha = reduce.current ? 1 : 1 - Math.exp(-18 * Math.min(delta, .1))
      node.position.x += (pose.x - node.position.x) * alpha; node.position.y += (pose.y - node.position.y) * alpha; node.position.z += (pose.z - node.position.z) * alpha
      node.rotation.set(pose.tilt, pose.yaw, 0, 'YXZ')
    }
  })
  return <group ref={root} name={name} userData={{ tileId, userId }}>{children}</group>
}
