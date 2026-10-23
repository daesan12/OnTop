import {
  PARK_PAVILIONS,
  PAVILION_CLOSED_SIDES,
  pavilionBenchRadius,
} from '../../config'
import { Instances, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import {
  createPavilionBench,
  createPavilionFloor,
} from './pavilionInteriorGeometry'

// Two shared geometry sets, no new texture downloads or per-frame rebuilds.
const sizes = new Map(
  [...new Set(PARK_PAVILIONS.map((p) => p.scale))].map((scale) => [
    scale,
    {
      bench: createPavilionBench(scale),
      floor: createPavilionFloor(scale),
      seats: PAVILION_CLOSED_SIDES.map((side) => {
        const angle = ((side + 1) * Math.PI) / 4,
          radius = pavilionBenchRadius(scale)
        return {
          p: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
          s: [1, 1, 1],
          r: [0, -Math.PI / 2 - angle, 0],
          c: '#ffffff',
        } as Part
      }),
    },
  ]),
)

export function PavilionInterior() {
  return (
    <group name="pavilion-timber-benches">
      {PARK_PAVILIONS.map((p) => {
        const art = sizes.get(p.scale)!
        return (
          <group
            key={p.id}
            name={`pavilion-interior-${p.id}`}
            position={[p.x, p.floor, p.z]}
          >
            <Instances
              parts={art.seats}
              material={
                <SurfaceMaterial
                  kind="wood"
                  vertexColors
                  detail={0.8}
                  strength={0.17}
                />
              }
            >
              <primitive object={art.bench} attach="geometry" dispose={null} />
            </Instances>
            <mesh name={`pavilion-wood-floor-${p.id}`} receiveShadow>
              <primitive object={art.floor} attach="geometry" dispose={null} />
              <SurfaceMaterial
                kind="wood"
                vertexColors
                detail={0.7}
                strength={0.2}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
