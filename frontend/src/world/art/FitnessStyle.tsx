import { OutdoorMetal } from './OutdoorMetal'
import { SurfaceMaterial } from './SurfaceMaterial'
import { useMemo } from 'react'
import { FITNESS, FITNESS_STATIONS } from '../../config'
import { PropBuilder } from './propGeometry'
import type { Part } from './Instances'

// Shared finish for the complete exercise set, based on the supplied reference.
export const fitnessColors = {
  frame: '#10554f',
  cream: '#e3d2af',
  brass: '#b89a57',
  rubber: '#193b36',
  tread: '#4b6860',
} as const
export const fitnessMetal = <OutdoorMetal />
export const fitnessRubber = (
  <meshStandardMaterial roughness={0.72} metalness={0.05} />
)

const pad = new PropBuilder([12, 8], 'fitness-pad')
for (let x = 0; x < 4; x++)
  for (let z = 0; z < 4; z++) {
    pad.box(
      'stone',
      (x + z) % 2 ? '#c7baa3' : '#dfd2ba',
      [-0.825 + x * 0.55, FITNESS.padSurfaceHeight - 0.003, -0.9 + z * 0.6],
      [0.538, 0.014, 0.588],
    )
  }
for (const side of [-1, 1]) {
  pad.box(
    'stone',
    '#e8dbc2',
    [side * 1.13, FITNESS.padSurfaceHeight + 0.001, 0],
    [0.06, 0.016, 2.46],
  )
  pad.box(
    'stone',
    '#e8dbc2',
    [0, FITNESS.padSurfaceHeight + 0.001, side * 1.23],
    [2.32, 0.016, 0.06],
  )
}
const padGeometry = pad.finish().stone!

export function FitnessPads({stations=FITNESS_STATIONS}:{stations?:typeof FITNESS_STATIONS}={}) {
  return (
    <group name="fitness-stone-inlays" userData={{ keepOpaque: true }}>
      {stations.map((s) => (
        <mesh
          key={s.id}
          geometry={padGeometry}
          dispose={null}
          position={s.position}
          rotation={[0, s.yaw, 0]}
          receiveShadow
        >
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={0.8}
            vertexColors
            detail={0.25}
            strength={0.18}
          />
        </mesh>
      ))}
    </group>
  )
}

// Small caps, collars and anchor plates stay within each existing post's footprint.
const trimCache = new WeakMap<
  readonly Part[],
  ReturnType<PropBuilder['finish']>
>()
export function FitnessPostTrim({ parts }: { parts: readonly Part[] }) {
  const art = useMemo(() => {
    const cached = trimCache.get(parts)
    if (cached) return cached
    const b = new PropBuilder()
    for (const part of parts) {
      if (
        part.s[1] < 0.32 ||
        part.s[0] < 0.07 ||
        part.r?.some((v) => Math.abs(v) > 0.001)
      )
        continue
      const [x, y, z] = part.p,
        r = part.s[0],
        bottom = y - part.s[1] / 2,
        top = y + part.s[1] / 2
      b.ball(
        'metal',
        fitnessColors.frame,
        [x, top, z],
        [r * 1.18, r * 0.65, r * 1.18],
      )
      b.cylinder(
        'metal',
        fitnessColors.brass,
        [x, top - 0.055, z],
        r * 1.12,
        r * 1.12,
        0.025,
      )
      if (bottom < 0.25) {
        b.box(
          'metal',
          fitnessColors.frame,
          [x, 0.09, z],
          [r * 3.2, 0.045, r * 3.2],
        )
        b.cylinder(
          'metal',
          fitnessColors.frame,
          [x, 0.17, z],
          r * 1.08,
          r * 1.45,
          0.14,
        )
        for (const dx of [-1, 1])
          for (const dz of [-1, 1])
            b.cylinder(
              'metal',
              fitnessColors.brass,
              [x + dx * r * 1.12, 0.118, z + dz * r * 1.12],
              0.017,
              0.017,
              0.012,
              [0, 0, 0],
              6,
            )
      }
      if (part.s[1] > 1) {
        b.box(
          'metal',
          fitnessColors.cream,
          [x, y, z + r * 0.94],
          [r * 0.85, part.s[1] * 0.55, 0.018],
        )
        b.box(
          'metal',
          fitnessColors.brass,
          [x, y + part.s[1] * 0.28, z + r * 0.97],
          [r * 1.05, 0.035, 0.02],
        )
      }
    }
    const result = b.finish()
    trimCache.set(parts, result)
    return result
  }, [parts])
  if (!art.metal) return null
  return (
    <mesh
      name="fitness-post-caps-and-trim"
      geometry={art.metal}
      dispose={null}
      castShadow
      receiveShadow
    >
      <OutdoorMetal vertexColors />
    </mesh>
  )
}
