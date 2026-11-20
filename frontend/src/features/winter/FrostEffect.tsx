import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { estimatedServerTime } from '../../network/worldClient'
import { useWinter, winterFrozen } from './state'

/** Frost gathers at the feet, leaving the face and silhouette readable. No enclosing ice box. */
export function FrostEffect({ userId }: { userId: string }) {
  const root = useRef<Group>(null), crystals = useRef<Group>(null), flakes = useRef<Group>(null)
  useFrame(() => {
    if (!root.current) return
    const now = estimatedServerTime(), player = useWinter.getState().players[userId]
    root.current.visible = winterFrozen(userId, now)
    if (!root.current.visible || !player) return
    const remaining = 1 - player.escapePresses / 6
    if (crystals.current) crystals.current.scale.y = .55 + remaining * .45
    if (flakes.current) {
      flakes.current.rotation.y = performance.now() / 2600
      flakes.current.position.y = Math.sin(performance.now() / 350) * .035
    }
  })
  return <group ref={root} name={'winter-frozen-' + userId} visible={false}>
    <mesh position={[0, -.77, 0]} raycast={() => {}}>
      <cylinderGeometry args={[.7, .76, .045, 16]} />
      <meshStandardMaterial color="#c9eaf4" transparent opacity={.65} roughness={.8} depthWrite={false} />
    </mesh>
    <group ref={crystals} position={[0, -.75, 0]} name="winter-frost-crystals">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = i * Math.PI / 4, height = .3 + (i % 3) * .14
        return <mesh key={i} position={[Math.sin(angle) * .49, height / 2, Math.cos(angle) * .49]}
          rotation={[Math.sin(angle) * .2, angle, Math.cos(angle) * .2]} raycast={() => {}}>
          <coneGeometry args={[.14, height, 4]} />
          <meshStandardMaterial color={i % 2 ? '#b2e6f5' : '#e1f7ff'} transparent opacity={.78} roughness={.25} metalness={.08} />
        </mesh>
      })}
    </group>
    <group ref={flakes} name="winter-frost-sparkles">
      {Array.from({ length: 10 }, (_, i) => {
        const angle = i * Math.PI * .764, y = -.35 + i * .14
        return <mesh key={i} position={[Math.sin(angle) * .47, y, Math.cos(angle) * .47]} raycast={() => {}}>
          <octahedronGeometry args={[i % 3 ? .035 : .065, 0]} />
          <meshBasicMaterial color="#e3faff" transparent opacity={.8} depthWrite={false} />
        </mesh>
      })}
    </group>
  </group>
}
