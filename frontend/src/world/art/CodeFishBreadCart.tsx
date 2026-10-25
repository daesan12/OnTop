import { CraftedPropLod, PropSign } from './CraftedProp'
import { cartAwning, cartGlass, cartMenu, cartName, fishCartArt } from './fishCartGeometry'

/** Local art only. The owning fish-bread group retains the existing anchor and proximity gate. */
export function CodeFishBreadCart() {
  return <group name="code-fish-cart">
    <CraftedPropLod name="fish-cart-craft" near={fishCartArt.near} far={fishCartArt.far} distance={22} />
    <mesh name="cart-display-glass">
      <primitive object={cartGlass} attach="geometry" dispose={null} />
      <meshPhysicalMaterial color="#bddbd2" metalness={0.08} roughness={0.12} transparent opacity={0.14}
        depthWrite={false} clearcoat={0.6} />
    </mesh>
    <PropSign position={[0, 0.70, 0.803]} width={1.60} height={0.31} draw={cartName} />
    <PropSign position={[0, 2.43, 1.087]} width={2.13} height={0.28} draw={cartAwning} />
    <PropSign position={[-1.35, 1.65, 0.77]} width={0.42} height={0.57} draw={cartMenu} />
  </group>
}
