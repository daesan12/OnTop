import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { Tile } from './DavinciBoard'
import type { DrawEffect } from './effects'
import { DRAW_MS, flightPose, pendingPose } from './layout'
import type { CodeTile } from './protocol'

export function DrawFlight({ draw, slot, scale, tile }: { draw: DrawEffect; slot: number; scale: number; tile: CodeTile | null }) {
  const root = useRef<Group>(null), reduce = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  useFrame(() => {
    if (!root.current) return
    const p = flightPose(draw.from, pendingPose(slot), (performance.now() - draw.started) / DRAW_MS, reduce.current)
    root.current.position.set(p.x, p.y, p.z); root.current.rotation.set(p.tilt, p.yaw, 0, 'YXZ')
  })
  return <group ref={root} name="secret-draw-flight" userData={{ tileId: draw.tileId, userId: draw.actor }}>
    <Tile tile={tile ?? { id: draw.tileId, color: draw.color, value: null, revealed: false }} hidden={!tile} faceUp={false}
      selected={false} scale={scale} clickable={false} onClick={() => {}} />
  </group>
}
