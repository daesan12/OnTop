import type { BufferGeometry } from 'three'
import { NightMaterial } from '../NightLighting'
import type { PropFinish } from './propGeometry'
import { propRenderBatches } from './propRenderBatches'
import { parkPropMaterial } from './parkMaterials'
export function PropModel({ art, name, shadow = true }: {
  art: Partial<Record<PropFinish, BufferGeometry>>
  name: string
  shadow?: boolean
}) {
  return <group name={name} matrixAutoUpdate={false}>
    {Object.entries(propRenderBatches(art)).map(([kind, geometry]) => <mesh
      key={kind} name={kind} geometry={geometry} dispose={null} matrixAutoUpdate={false}
      castShadow={shadow && kind !== 'glow'} receiveShadow
      userData={kind === 'stone' ? { keepOpaque: true } : undefined}>
      {kind === 'glow'
        ? <NightMaterial color="#ffca79" emission="#ff9f35" strength={1.1} vertexColors />
        : <primitive object={parkPropMaterial(geometry, kind === 'tile')} attach="material" dispose={null} />}
    </mesh>)}
  </group>
}
