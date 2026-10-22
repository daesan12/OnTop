import { useLayoutEffect, useMemo, useRef } from 'react'
import { LOD, type Group } from 'three'
import { extend } from '@react-three/fiber'
import { WORLD } from '../../config'
import { Instances, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BoundaryMasonry, MaksaeMaterial } from './BoundaryMaterial'
import { createWallCorner, createWallRoof, WALL } from './boundaryGeometry'

// Only three shared geometry sets for the entire 640m perimeter, generated on lazy world import.
const near = createWallRoof(),
  far = createWallRoof(false),
  corner = createWallCorner()
const white = '#ffffff'
const WallLOD = extend(LOD)
const corners: Part[] = [-1, 1].flatMap((x) =>
  [-1, 1].map(
    (z) =>
      ({
        p: [x * WORLD.halfSize, 0, z * WORLD.halfSize],
        s: [1, 1, 1],
        c: white,
      }) as Part,
  ),
)
const cornerPiers = corners.map((p) => ({
  ...p,
  p: [p.p[0], 0.95, p.p[2]] as [number, number, number],
  s: [0.91, 1.9, 0.91] as [number, number, number],
}))
const sections = Array.from({ length: 4 }, (_, side) =>
  Array.from({ length: 8 }, (_, i) => ({ side, i })),
).flat()

function Roof({ detailed, parts }: { detailed: boolean; parts: Part[] }) {
  const model = detailed ? near : far
  return (
    <>
      <Instances
        parts={parts}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            detail={0.18}
            strength={0.14}
            vertexColors
          />
        }
      >
        <primitive object={model.clay} attach="geometry" dispose={null} />
      </Instances>
      <Instances
        parts={parts}
        shadow={false}
        material={<meshStandardMaterial vertexColors roughness={0.96} />}
      >
        <primitive object={model.timber} attach="geometry" dispose={null} />
      </Instances>
      {model.ends && (
        <Instances parts={parts} shadow={false} material={<MaksaeMaterial />}>
          <primitive object={model.ends} attach="geometry" dispose={null} />
        </Instances>
      )}
    </>
  )
}

function WallSection({ side, i }: { side: number; i: number }) {
  const lod = useRef<LOD>(null),
    detail = useRef<Group>(null),
    simple = useRef<Group>(null)
  // Leave 45cm at each end, beneath the raised corner cap, for a clean hip joint.
  const span = (WORLD.halfSize * 2 - 0.9) / 8,
    x = -WORLD.halfSize + 0.45 + (i + 0.5) * span
  const parts = useMemo<Part[]>(
    () =>
      Array.from({ length: 5 }, (_, n) => ({
        p: [((n - 2) * span) / 5, 0, 0],
        s: [span / 20, 1, 1],
        c: white,
      })),
    [span],
  )
  useLayoutEffect(() => {
    const l = lod.current!
    l.addLevel(detail.current!, 0)
    l.addLevel(simple.current!, WALL.nearDistance, 0.16)
    return () => {
      l.levels.length = 0
    }
  }, [])
  const yaw = (side * Math.PI) / 2
  return (
    <group
      position={[
        Math.cos(yaw) * x - Math.sin(yaw) * WORLD.halfSize,
        0,
        -Math.sin(yaw) * x - Math.cos(yaw) * WORLD.halfSize,
      ]}
      rotation={[0, yaw, 0]}
    >
      <Instances
        parts={[
          {
            p: [0, (WALL.bodyTop + WALL.base) / 2, 0],
            s: [span, WALL.bodyTop - WALL.base, WALL.depth],
            c: white,
          },
        ]}
        shadow={false}
        material={<BoundaryMasonry />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={[
          { p: [0, 0.12, 0], s: [span, 0.24, 0.77], c: '#999b95' },
          { p: [0, 0.255, 0], s: [span, 0.065, 0.73], c: '#b1b1a6' },
        ]}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            detail={0.5}
            strength={0.3}
            meters={0.7}
          />
        }
      >
        <boxGeometry />
      </Instances>
      <WallLOD ref={lod} name="boundary-roof-lod">
        <group ref={detail}>
          <Roof detailed parts={parts} />
        </group>
        <group ref={simple}>
          <Roof detailed={false} parts={parts} />
        </group>
      </WallLOD>
    </group>
  )
}

export function ParkBoundary() {
  return (
    <group
      name="reference-tiled-boundary"
      userData={{
        assetId: 'original/reference-wall-1',
        reference: 'wall_1.jpg',
      }}
    >
      {sections.map((s) => (
        <WallSection key={`${s.side}-${s.i}`} {...s} />
      ))}
      <Instances
        parts={cornerPiers}
        shadow={false}
        material={<BoundaryMasonry />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={corners}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            detail={0.18}
            strength={0.14}
            vertexColors
          />
        }
      >
        <primitive object={corner.clay} attach="geometry" dispose={null} />
      </Instances>
      <Instances parts={corners} shadow={false} material={<MaksaeMaterial />}>
        <primitive object={corner.ends} attach="geometry" dispose={null} />
      </Instances>
    </group>
  )
}
