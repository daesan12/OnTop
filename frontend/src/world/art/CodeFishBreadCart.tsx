import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { bungeoppangView } from '../../features/bungeoppang/bungeoppangView'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { cartAwning, cartGlass, cartMenu, cartName, fishCartArt, fishCartCanopyArt } from './fishCartGeometry'

/** Local art only. The owning fish-bread group retains the existing anchor and proximity gate. */
export function CodeFishBreadCart({detailDistance=22}:{detailDistance?:number}={}) {
  const canopy = useRef<Group>(null)
  useFrame(() => {
    if (canopy.current) canopy.current.visible = !bungeoppangView.active
      && performance.now() >= bungeoppangView.returningUntil
  })
  return <group name="code-fish-cart">
    <CraftedPropLod name="fish-cart-craft" near={fishCartArt.near} far={fishCartArt.far} distance={detailDistance} />
    <group ref={canopy} name="fish-cart-cooking-occluders">
      <CraftedPropLod name="fish-cart-canopy" near={fishCartCanopyArt.near} far={fishCartCanopyArt.far} distance={detailDistance} />
      <PropSign position={[0, 2.43, 1.087]} width={2.13} height={0.28} draw={cartAwning} />
    </group>
    <mesh name="cart-display-glass">
      <primitive object={cartGlass} attach="geometry" dispose={null} />
      <meshPhysicalMaterial color="#bddbd2" metalness={0.08} roughness={0.12} transparent opacity={0.14}
        depthWrite={false} clearcoat={0.6} />
    </mesh>
    <PropSign position={[0, 0.70, 0.803]} width={1.60} height={0.31} draw={cartName} />
    <PropSign position={[-1.35, 1.65, 0.77]} width={0.42} height={0.57} draw={cartMenu} />
  </group>
}
