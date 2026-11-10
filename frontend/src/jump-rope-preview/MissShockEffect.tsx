import { useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Shape, type Group, type MeshBasicMaterial } from 'three'
import type { Demo } from './JumpRopePreview'
import { sampleMissShock, type MissShockPose } from './missShock'
import type { PreviewRound } from './previewRound'

const bolt = new Shape()
bolt.moveTo(0.035, 0.198)
bolt.lineTo(-0.112, -0.014)
bolt.lineTo(-0.026, -0.016)
bolt.lineTo(-0.076, -0.184)
bolt.lineTo(0.128, 0.06)
bolt.lineTo(0.04, 0.054)
bolt.closePath()

// Local coordinates around the unscaled avatar. Each bolt drifts on its own beat.
const arcs = [
  [-0.44, 0.38, 0.22, -0.4], [0.42, 0.42, 0.27, 0.8],
  [-0.49, 0.93, 0.33, 0.63], [0.51, 1.05, 0.35, -0.48],
  [-0.32, 1.42, 0.27, 0.23], [0.36, 1.49, 0.29, 0.55],
] as const

export function MissShockEffect({ round, demoRef, scale, children, sceneTime, finalePreviewAt }: {
  round: PreviewRound
  demoRef: RefObject<Demo | null>
  scale: number
  children: (shock: RefObject<MissShockPose>) => ReactNode
  sceneTime: (now: number) => number
  finalePreviewAt: () => number | undefined
}) {
  const shock = useRef(sampleMissShock(Infinity))
  const figure = useRef<Group>(null)
  const sparks = useRef<Group>(null)
  const arcGroups = useRef<(Group | null)[]>([])
  const outlines = useRef<(MeshBasicMaterial | null)[]>([])
  const cores = useRef<(MeshBasicMaterial | null)[]>([])

  useFrame(() => {
    const demo = demoRef.current
    const previewAt = demo?.action === 'shock' || demo?.action === 'miss' ? demo.startedAt : null
    const startedAt = round.shockStartedAt ?? previewAt
    const now = performance.now()
    const finaleAt = finalePreviewAt()
    const age = finaleAt !== undefined ? now - finaleAt : startedAt === null ? Infinity : sceneTime(now) - startedAt
    shock.current = sampleMissShock(age)
    const { intensity, sway, pitch, roll } = shock.current

    if (figure.current) {
      figure.current.position.x = sway
      figure.current.rotation.set(pitch, 0, roll)
    }
    if (!sparks.current) return
    sparks.current.visible = intensity > 0
    if (!sparks.current.visible) return
    sparks.current.position.y = round.motion.frame.height / scale

    arcs.forEach(([x, y, z, rotation], index) => {
      const arc = arcGroups.current[index]
      const outline = outlines.current[index]
      const core = cores.current[index]
      if (!arc || !outline || !core) return
      const beat = age * (0.018 + index * 0.003) + index * 1.8
      const ripple = Math.sin(beat)
      arc.position.set(x + ripple * 0.052, y + Math.cos(beat * 0.74) * 0.07, z)
      arc.rotation.z = rotation + Math.sin(beat * 1.2) * 0.24
      arc.scale.setScalar(0.72 + 0.22 * ripple + 0.2 * intensity)
      outline.opacity = intensity * (0.7 + 0.22 * ripple)
      core.opacity = intensity * 0.94
    })
  }, -0.5)

  return (
    <group scale={scale}>
      <group ref={figure}>{children(shock)}</group>
      <group ref={sparks} visible={false}>
        {arcs.map((_, index) => (
          <group key={index} ref={arc => { arcGroups.current[index] = arc }}>
            <mesh>
              <shapeGeometry args={[bolt]} />
              <meshBasicMaterial ref={material => { outlines.current[index] = material }} color="#267cd6" transparent depthWrite={false} />
            </mesh>
            <mesh scale={[0.64, 0.8, 1]} position-z={0.005}>
              <shapeGeometry args={[bolt]} />
              <meshBasicMaterial ref={material => { cores.current[index] = material }} color="#d9faff" transparent depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
