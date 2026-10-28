import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial } from 'three'
import { PARK_PAVILIONS, PAVILION_LANTERN, PILLARS, smoothRange } from '../../config'
import { PropBuilder } from './propGeometry'
import type { Part } from './Instances'
import { DetailInstances } from './DetailInstances'
import { environmentFrame } from '../environmentState'

// One octagonal shade and frame, shared by every lamp. Tiny carved flowers,
// lattice slats, tassel strands and individual chain rings are colour blocks.
const b = new PropBuilder([6, 3], 'pavilion-lanterns')
b.cylinder('paint', '#833d2c', [0, 0.29, 0], 0.29, 0.29, 0.62, [0, Math.PI / 8, 0], 8)
for (let i = 0; i < 8; i++) {
  const a = (i + 0.5) * Math.PI / 4
  b.box('glow', '#f4e2b9', [Math.sin(a) * 0.273, 0.29, Math.cos(a) * 0.273],
    [0.20, 0.46, 0.012], [0, a, 0])
}
b.cylinder('paint', '#274c3b', [0, 0.71, 0], 0.04, 0.4, 0.28, [0, Math.PI / 8, 0], 8)
b.cylinder('paint', '#a95738', [0, -0.035, 0], 0.32, 0.32, 0.08, [0, Math.PI / 8, 0], 8)
b.ball('paint', '#bb9253', [0, 0.9, 0], [0.04, 0.06, 0.04])
// Keep the previous lowest point for spectator-camera clearance.
b.cylinder('paint', '#913c32', [0, -0.193, 0], 0.018, 0.035, 0.234, [0, 0, 0], 4)
const art = b.finish()
const placements: Part[] = PARK_PAVILIONS.map((p) => ({
  p: [p.x, p.floor + PAVILION_LANTERN.heightFactor * p.scale, p.z],
  s: [1, 1, 1],
  c: '#ffffff',
}))
const ceiling = PARK_PAVILIONS.map((p) => p.floor + 4.12 * p.scale)
const main = PARK_PAVILIONS[0]
for (let i = 0; i < 8; i += 2) {
  const p = PILLARS[i]!
  placements.push({
    p: [
      main.x + p[0] * 1.12 * main.scale,
      main.floor + 2.9 * main.scale,
      main.z + (p[2] + 3) * 1.12 * main.scale,
    ],
    s: [0.9, 0.9, 0.9],
    c: '#ffffff',
  })
  ceiling.push(main.floor + 3.72 * main.scale)
}

const chains: Part[] = placements.map((p, i) => {
  const start = p.p[1] + 0.96 * p.s[1], end = ceiling[i]!
  return { p: [p.p[0], (start + end) / 2, p.p[2]], s: [0.012, Math.max(0, end - start), 0.012], c: '#bb9253' }
})
function PaperMaterial() {
  const ref = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (ref.current) ref.current.emissiveIntensity = smoothRange(0.08, 0.9, environmentFrame.night) * 1.65
  })
  return <meshStandardMaterial ref={ref} vertexColors flatShading roughness={1}
    emissive="#ffb85c" emissiveIntensity={0} />
}
export function TraditionalPavilionLanterns() {
  return <group name="traditional-pavilion-lanterns" dispose={null}>
    {Object.entries(art).map(([kind, geometry]) => <DetailInstances key={kind}
      name={`lantern-${kind}`} parts={placements} range={Infinity}
      material={kind === 'glow' ? <PaperMaterial /> : <meshStandardMaterial vertexColors flatShading roughness={1} />}>
      <primitive object={geometry} attach="geometry" />
    </DetailInstances>)}
    <DetailInstances name="lantern-hanging-cords" parts={chains} range={Infinity}>
      <cylinderGeometry args={[1, 1, 1, 4, 1, true]} />
    </DetailInstances>
  </group>
}
