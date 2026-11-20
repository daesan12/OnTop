import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, LineBasicMaterial, MeshPhysicalMaterial } from 'three'
import { estimatedServerTime } from '../../network/worldClient'
import { useWinter, winterFrozen } from './state'
import { CARRY_ESCAPE_PRESSES } from '../carry/escape'

/** A faceted, translucent ice crystal encloses the whole figure, including the head. */
export function FrostEffect({ userId }: { userId: string }) {
  const root = useRef<Group>(null), crystals = useRef<Group>(null), flakes = useRef<Group>(null)
  const shell = useRef<MeshPhysicalMaterial>(null), cracks = useRef<LineBasicMaterial>(null)
  const ice = useMemo(() => {
    const geometry = new IcosahedronGeometry(1, 1).scale(.76, 1.24, .68)
    const vertices: number[] = []
    const surface = (angle: number, height: number) => {
      const radius = Math.sqrt(1 - height * height)
      return [Math.sin(angle) * .765 * radius, .3 + height * 1.245, Math.cos(angle) * .685 * radius]
    }
    for (let strand = 0; strand < 7; strand++) {
      const angle = strand * Math.PI * 2 / 7
      const path = [[angle, .82], [angle + .13, .48], [angle - .13, .15], [angle + .16, -.18], [angle - .09, -.58]]
      for (let i = 1; i < path.length; i++) {
        vertices.push(...surface(...path[i - 1]! as [number, number]), ...surface(...path[i]! as [number, number]))
      }
      vertices.push(...surface(angle - .13, .15), ...surface(angle - .42, .35))
    }
    return { geometry, lines: new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3)) }
  }, [])
  useEffect(() => {
    const surface = shell.current, lines = cracks.current
    return () => { ice.geometry.dispose(); ice.lines.dispose(); surface?.dispose(); lines?.dispose() }
  }, [ice])
  useFrame(() => {
    if (!root.current) return
    const now = estimatedServerTime(), player = useWinter.getState().players[userId]
    root.current.visible = winterFrozen(userId, now)
    if (!root.current.visible || !player) return
    const remaining = 1 - player.escapePresses / CARRY_ESCAPE_PRESSES
    if (crystals.current) crystals.current.scale.y = .55 + remaining * .45
    if (shell.current) shell.current.opacity = .24 + remaining * .12
    if (cracks.current) cracks.current.opacity = .18 + (1 - remaining) * .7
    if (flakes.current) {
      flakes.current.rotation.y = performance.now() / 2600
      flakes.current.position.y = Math.sin(performance.now() / 350) * .035
    }
  })
  return <group ref={root} name={'winter-frozen-' + userId} visible={false}>
    <mesh name="winter-full-body-ice" position={[0, .3, 0]} geometry={ice.geometry} dispose={null} raycast={() => {}}>
      <meshPhysicalMaterial ref={shell} color="#99d8f3" transparent opacity={.36} roughness={.2}
        metalness={.03} clearcoat={.9} flatShading depthWrite={false} />
    </mesh>
    <lineSegments name="winter-ice-cracks" geometry={ice.lines} dispose={null} raycast={() => {}}>
      <lineBasicMaterial ref={cracks} color="#effcff" transparent opacity={.18} depthWrite={false} />
    </lineSegments>
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
