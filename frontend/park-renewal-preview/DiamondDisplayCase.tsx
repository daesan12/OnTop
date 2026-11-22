import { useEffect, useMemo } from 'react'
import { CylinderGeometry, FrontSide, SphereGeometry, TorusGeometry } from 'three'
import { PropBuilder } from '../src/world/art/propGeometry'

/** A small weathered display case on the existing stone plinth. */
export function DiamondDisplayCase({ at }: { at: readonly [number, number, number] }) {
  const frame = useMemo(() => {
    const b = new PropBuilder()
    b.add('paint', new CylinderGeometry(.6, .63, .06, 8), '#26332e', [0, -.015, 0])
    b.add('gold', new CylinderGeometry(.565, .6, .035, 24), '#796a43', [0, .004, 0])
    for (const y of [.035, 1.095]) {
      b.add('gold', new TorusGeometry(.545, .018, 7, 40), '#7f7859', [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
    }
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * .548, z = Math.cos(angle) * .548
      b.add('paint', new CylinderGeometry(.011, .011, 1.06, 6), '#45544d', [x, .565, z])
      for (const y of [.035, 1.095]) b.add('gold', new SphereGeometry(.022, 7, 5), '#a09567', [x, y, z])
    }
    b.add('paint', new CylinderGeometry(.55, .565, .045, 32), '#293831', [0, 1.115, 0])
    b.add('gold', new CylinderGeometry(.092, .11, .035, 12), '#827650', [0, 1.15, 0])
    b.add('paint', new SphereGeometry(.038, 10, 6), '#39483f', [0, 1.177, 0])
    return b.finish()
  }, [])
  useEffect(() => () => { Object.values(frame).forEach(geometry => geometry?.dispose()) }, [frame])
  return <group name="interior-diamond-display-case" position={[...at]}>
    {Object.entries(frame).map(([finish, geometry]) => <mesh key={finish} geometry={geometry} dispose={null} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={finish === 'gold' ? .4 : .65} metalness={finish === 'gold' ? .65 : .4} />
    </mesh>)}
    <mesh name="diamond-case-glass" position={[0, .565, 0]} renderOrder={2}>
      <cylinderGeometry args={[.535, .535, 1.06, 48, 1, true]} />
      {/* 전시함 바깥에서 보는 얇은 유리: 뒷면까지 알파 합성해 막이 겹치는 현상을 줄인다. */}
      <meshPhysicalMaterial color="#bedcd2" transparent opacity={.12} roughness={.1} metalness={.05}
        clearcoat={1} clearcoatRoughness={.08} side={FrontSide} depthWrite={false} />
    </mesh>
  </group>
}
