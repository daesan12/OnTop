import type { BufferGeometry } from 'three'
import { NightMaterial } from '../NightLighting'
import type { PropFinish } from './propGeometry'
import { propRenderBatches } from './propRenderBatches'
export function PropModel({ art, name, shadow = true }: {
  art: Partial<Record<PropFinish, BufferGeometry>>
  name: string
  shadow?: boolean
}) {
  return <group name={name}>
    {Object.entries(propRenderBatches(art)).map(([kind, geometry]) => <mesh
      key={kind} name={kind} geometry={geometry} dispose={null}
      castShadow={shadow && kind !== 'glow'} receiveShadow
      userData={kind === 'stone' ? { keepOpaque: true } : undefined}>
      {kind === 'glow'
        ? <NightMaterial color="#ffca79" emission="#ff9f35" strength={1.1} vertexColors />
        : <meshLambertMaterial vertexColors side={kind === 'tile' ? 2 : 0} />}
    </mesh>)}
  </group>
}
