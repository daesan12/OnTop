import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { outdoorReflectionMap } from './ornamentTextures'
import { bungeoppangView } from '../../features/bungeoppang/bungeoppangView'
import { bungeoppangV5Enabled } from '../../features/bungeoppang/config'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { cartAwning, cartGlass, cartMenu, cartName, fishCartArt, fishCartCanopyArt, fishCartStockArt, fishCartPreparationArt } from './fishCartGeometry'

/** Local art only. The owning fish-bread group retains the existing anchor and proximity gate. */
export function CodeFishBreadCart() {
  const root = useRef<Group>(null)
  const canopy = useRef<Group>(null)
  const display = useRef<Group>(null)
  const prep = useRef<Group>(null)
  useFrame(() => {
    if (root.current) root.current.visible = !bungeoppangV5Enabled || !bungeoppangView.active
    if (canopy.current) canopy.current.visible = !bungeoppangView.active
      && performance.now() >= bungeoppangView.returningUntil
    if (display.current) display.current.visible = !bungeoppangView.active
    if (prep.current) prep.current.visible = !bungeoppangView.active || !bungeoppangV5Enabled
  })
  return <group ref={root} name="code-fish-cart">
    <CraftedPropLod name="fish-cart-craft" near={fishCartArt.near} far={fishCartArt.far} distance={22} environment={outdoorReflectionMap} />
    <group ref={prep}><CraftedPropLod name="fish-cart-preparation" near={fishCartPreparationArt.near} far={fishCartPreparationArt.far} distance={22} /></group>
    <group ref={canopy} name="fish-cart-cooking-occluders">
      <CraftedPropLod name="fish-cart-canopy" near={fishCartCanopyArt.near} far={fishCartCanopyArt.far} distance={22} environment={outdoorReflectionMap} />
      <PropSign position={[0, 2.43, 1.087]} width={2.13} height={0.28} draw={cartAwning} />
    </group>
    <group ref={display} name="cart-display-stock">
    <CraftedPropLod name="fish-cart-stock" near={fishCartStockArt.near} far={fishCartStockArt.far} distance={22} />
    <mesh name="cart-display-glass">
      <primitive object={cartGlass} attach="geometry" dispose={null} />
      <meshPhysicalMaterial color="#bddbd2" metalness={0.08} roughness={0.12} transparent opacity={0.14}
        depthWrite={false} clearcoat={0.6} />
    </mesh>
    </group>
    <PropSign position={[0, 0.70, 0.803]} width={1.60} height={0.31} draw={cartName} />
    <PropSign position={[-1.35, 1.65, 0.77]} width={0.42} height={0.57} draw={cartMenu} />
  </group>
}
