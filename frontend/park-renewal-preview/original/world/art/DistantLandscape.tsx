import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Color, Float32BufferAttribute, type MeshBasicMaterial } from 'three'
import { Instances, type Part } from '../../../../src/world/art/Instances'
import { environmentFrame } from '../../../../src/world/environmentState'

// Low-cost skyline silhouettes, intentionally outside playable space.
function ridge(radius: number, phase: number, base: number) {
  const points: number[] = [],
    indices: number[] = []
  for (let i = 0; i <= 160; i++) {
    const angle = (i / 160) * Math.PI * 2
    const height =
      base +
      18 * Math.sin(angle * 3 + phase) +
      10 * Math.cos(angle * 7 - phase) +
      4 * Math.sin(angle * 13)
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius
    points.push(x, -15, z, x, height, z)
    if (i) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
const far = ridge(650, 0.6, 80),
  near = ridge(520, 2.1, 46)
const tower: Part[] = [
  { p: [0, 39, 0], s: [2.1, 78, 2.1], c: '#899594' },
  { p: [0, 80, 0], s: [11, 5, 11], c: '#7a878a' },
  { p: [0, 85, 0], s: [9, 5, 9], c: '#91a09e' },
  { p: [0, 104, 0], s: [0.55, 34, 0.55], c: '#8b9797' },
]
export function DistantLandscape({anchorTowerToRidge=false}:{anchorTowerToRidge?:boolean}={}) {
  const towerAngle=Math.atan2(368,-368)
  const towerBaseY=anchorTowerToRidge?46+18*Math.sin(towerAngle*3+2.1)+10*Math.cos(towerAngle*7-2.1)+4*Math.sin(towerAngle*13)-.5:62
  const farMaterial = useRef<MeshBasicMaterial>(null), nearMaterial = useRef<MeshBasicMaterial>(null)
  const colors = useMemo(() => ({
    dayFar: new Color('#b6dfdf'), dayNear: new Color('#a9d4b9'),
    nightFar: new Color('#233a4a'), nightNear: new Color('#1b3340'),
  }), [])
  useFrame(() => {
    // A soft painted backdrop keeps hills fresh without brightening the park floor.
    farMaterial.current?.color.copy(colors.nightFar).lerp(colors.dayFar, environmentFrame.daylight)
    nearMaterial.current?.color.copy(colors.nightNear).lerp(colors.dayNear, environmentFrame.daylight)
  }, -90)
  return (
    <group name="seoul-distant-landscape" userData={{ keepOpaque: true }}>
      <mesh name="distant-mountain-far" geometry={far} dispose={null}>
        <meshBasicMaterial ref={farMaterial} color="#b6dfdf" side={2} />
      </mesh>
      <mesh name="distant-mountain-near" geometry={near} dispose={null}>
        <meshBasicMaterial ref={nearMaterial} color="#a9d4b9" side={2} />
      </mesh>
      <group name="namsan-tower-silhouette" position={[-368, towerBaseY, 368]}>
        <Instances parts={tower} shadow={false}>
          <cylinderGeometry args={[1, 1, 1, 12]} />
        </Instances>
        <mesh position={[0, 87.7, 0]}>
          <coneGeometry args={[11, 2.5, 16]} />
          <meshStandardMaterial color="#8d9998" roughness={1} />
        </mesh>
      </group>
    </group>
  )
}
