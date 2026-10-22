import type { BufferGeometry } from 'three'
import { OutdoorMetal } from './OutdoorMetal'
import { SurfaceMaterial } from './SurfaceMaterial'
import { NightMaterial } from '../NightLighting'
import type { PropFinish } from './propGeometry'
export function PropModel({
  art,
  name,
  shadow = true,
}: {
  art: Partial<Record<PropFinish, BufferGeometry>>
  name: string
  shadow?: boolean
}) {
  return (
    <group name={name}>
      {Object.entries(art).map(([kind, geometry]) => (
        <mesh
          key={kind}
          geometry={geometry}
          dispose={null}
          castShadow={shadow && kind !== 'glow'}
          receiveShadow
          userData={kind === 'stone' ? { keepOpaque: true } : undefined}
        >
          {kind === 'wood' ? (
            <SurfaceMaterial
              kind="wood"
              vertexColors
              mapping="box"
              meters={1.1}
              detail={0.42}
              strength={0.2}
            />
          ) : kind === 'stone' ? (
            <SurfaceMaterial
              kind="stone"
              vertexColors
              mapping="box"
              meters={0.85}
              detail={0.38}
              strength={0.25}
            />
          ) : kind === 'tile' ? (
            <SurfaceMaterial
              kind="stone"
              mapping="box"
              meters={0.6}
              vertexColors
              detail={0.22}
              strength={0.12}
              side={2}
            />
          ) : kind === 'paint' ? (
            <SurfaceMaterial
              kind="wood"
              mapping="box"
              meters={1.2}
              vertexColors
              detail={0.12}
              strength={0.08}
            />
          ) : kind === 'glow' ? (
            <NightMaterial
              color="#ffca79"
              emission="#ff9f35"
              strength={1.1}
              vertexColors
            />
          ) : (
            <OutdoorMetal
              vertexColors
              finish={kind === 'gold' ? 'brass' : 'iron'}
            />
          )}
        </mesh>
      ))}
    </group>
  )
}
