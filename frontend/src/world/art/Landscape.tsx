import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import {
  TABLES,
  PARK_SIZE,
  PARK_PAVILIONS,
  TREES,
  DENSE_TREE_PLANTINGS,
  WILLOW_TREES,
  GARDEN_TREES,
  groundHeight,
  type QualityPreset,
} from '../../config'
import { SpatialInstances, seeded, type Part } from './Instances'
import { isParkLawn } from './ParkGround'
import { SurfaceMaterial } from './SurfaceMaterial'
import { DetailInstances, DetailMaterial } from './DetailInstances'

// World-space distance budget for sub-meter decoration, independent of map area.
const detailRanges: Record<QualityPreset, number> = {
  low: 32,
  medium: 44,
  high: 56,
}

function vegetation(quality: QualityPreset) {
  const rand = seeded(4317)
  const shrubs: Part[] = [],
    grass: Part[] = [],
    flowers: Part[] = [],
    fallen: Part[] = []
  TREES.forEach(([x, , z], i) => {
    const peripheral = i >= 10
    // Low shrubs cluster near trunk bases, outside the central walking axis.
    for (let k = 0; k < (peripheral ? 3 : 12); k++) {
      const a = (k / 12) * Math.PI * 2,
        r = 1.5 + rand() * 0.7
      shrubs.push({
        p: [x + Math.cos(a) * r, 0.28 + rand() * 0.2, z + Math.sin(a) * r],
        s: [0.38, 0.28, 0.38],
        c: k % 3 ? '#65794b' : '#889054',
      })
    }
    for (let k = 0; k < (peripheral ? 4 : 26); k++) {
      const a = rand() * Math.PI * 2,
        r = 0.6 + rand() * 2.4
      fallen.push({
        p: [x + Math.cos(a) * r, 0.032, z + Math.sin(a) * r],
        s: [0.08, 0.014, 0.13],
        r: [0, a, 0],
        c: k % 2 ? '#b29652' : '#a8853f',
      })
    }
  })
  {
    const density = Math.round(
      (quality === 'low' ? 24000 : quality === 'medium' ? 40000 : 64000) *
        (PARK_SIZE / 320) ** 2,
    )
    for (
      let i = 0, attempts = 0;
      i < density && attempts < density * 8;
      attempts++
    ) {
      const px = (rand() - 0.5) * (PARK_SIZE - 8),
        pz = (rand() - 0.5) * (PARK_SIZE - 8)
      if (!isParkLawn(px, pz)) continue
      i++
      grass.push({
        p: [px, 0.024, pz],
        s: [0.7 + rand() * 0.6, 0.11 + rand() * 0.14, 0.7 + rand() * 0.6],
        r: [0, rand() * 6, 0],
        c: ['#617447', '#7d904f', '#93a357', '#566b3e', '#a6ac6c'][i % 5]!,
      })
      if (i % 70 === 0)
        flowers.push({
          p: [px, 0.24, pz],
          s: [0.065, 0.04, 0.065],
          c: i % 24 ? '#dfc479' : '#eee1b2',
        })
    }
  }
  for (const parts of [shrubs, grass, flowers, fallen])
    for (const p of parts)
      p.p = [p.p[0], p.p[1] + groundHeight(p.p[0], p.p[2]), p.p[2]]
  return { shrubs, grass, flowers, fallen }
}

// Four bent, tapered blades per tuft (12 triangles), no transparent overdraw.
const grassGeometry = (() => {
  const vertices: number[] = [],
    colors: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4,
      c = Math.cos(a),
      s = Math.sin(a)
    const points = [
      [-0.035, 0, 0],
      [0.035, 0, 0],
      [-0.008, 0.62, 0.025],
      [0.028, 0.62, 0.025],
      [0.065, 1 + i * 0.13, 0.065],
    ]
    for (const j of [0, 1, 2, 1, 3, 2, 2, 3, 4]) {
      const [x, y, z] = points[j]!
      vertices.push(
        x! * c - z! * s + Math.sin(i) * 0.1,
        y!,
        x! * s + z! * c + Math.cos(i) * 0.1,
      )
      const brightness = 0.82 + y! * 0.12
      colors.push(brightness, brightness, brightness)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
})()

export function Vegetation({ quality }: { quality: QualityPreset }) {
  const detailRange = detailRanges[quality]
  const art = useMemo(() => vegetation(quality), [quality])
  return (
    <group
      name="art-vegetation"
      userData={{ assetId: 'placeholder/vegetation' }}
    >
      <SpatialInstances
        parts={art.shrubs}
        material={
          <SurfaceMaterial
            kind="grass"
            strength={0.7}
            color="#b0c090"
            detail={0.3}
          />
        }
      >
        <icosahedronGeometry args={[1, 1]} />
      </SpatialInstances>
      <DetailInstances
        name="detail-grass"
        parts={art.grass}
        range={detailRange}
        material={
          <DetailMaterial
            range={detailRange}
            side={2}
            vertexColors
            roughness={1}
            emissive="#40552a"
            emissiveIntensity={0.1}
          />
        }
      >
        <primitive object={grassGeometry} attach="geometry" dispose={null} />
      </DetailInstances>
      <DetailInstances
        name="detail-flowers"
        parts={art.flowers}
        range={detailRange}
      >
        <icosahedronGeometry />
      </DetailInstances>
      <DetailInstances
        name="detail-fallen"
        parts={art.fallen}
        range={detailRange}
      >
        <octahedronGeometry />
      </DetailInstances>
    </group>
  )
}

const contacts: Part[] = [
  ...TREES.map(([x, y, z]): Part => ({
    p: [x, y + 0.025, z],
    s: [4.5, 4.5, 1],
    r: [-Math.PI / 2, 0, 0],
    c: '#000000',
  })),
  ...[
    ...DENSE_TREE_PLANTINGS.map((t) => ({
      x: t.position[0],
      z: t.position[2],
      scale: t.scale,
    })),
    ...WILLOW_TREES.map(([x, , z]) => ({ x, z, scale: 1.3 })),
    ...GARDEN_TREES,
  ].map(({ x, z, scale }): Part => ({
    p: [x, groundHeight(x, z) + 0.035, z],
    s: [3.8 * scale, 3.8 * scale, 1],
    r: [-Math.PI / 2, 0, 0],
    c: '#000000',
  })),
  ...TABLES.map(
    (t) =>
      ({
        p: [t.position[0], t.position[1] + 0.019, t.position[2]],
        s: [3, 2.7, 1],
        r: [-Math.PI / 2, 0, 0],
        c: '#000000',
      }) as Part,
  ),
  {
    p: [0, PARK_PAVILIONS[0].floor + 0.04, 0],
    s: [9.2, 9.2, 1],
    r: [-Math.PI / 2, 0, 0],
    c: '#000000',
  },
]
/** Cheap analytical contact shade for Low; no extra lights, render targets or textures. */
export function ContactShade() {
  return (
    <SpatialInstances
      parts={contacts}
      shadow={false}
      material={
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexShader={`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`}
          fragmentShader={`varying vec2 vUv; void main(){float a=pow(max(0.,1.-length(vUv-.5)*2.),1.5)*.25;gl_FragColor=vec4(.13,.15,.10,a);}`}
        />
      }
    >
      <planeGeometry />
    </SpatialInstances>
  )
}
