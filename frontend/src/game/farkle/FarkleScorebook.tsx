import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { inputState, scenePointerOwners } from '../../world/inputOwnership'
import { useReducedMotion } from '../onecard/useReducedMotion'
import { toggleScoreSheet, useDiceUI } from './controls'
import { paintScorebookCover } from './scorebookArt'

// This touchable prop keeps its bevels even in the park's simplified map mode.
const bookGeometry = new RoundedBoxGeometry(1, 1, 1, 1, .035)
const pageEdges = [.014, .019, .024, .029]
function BookBox() {
  return <primitive object={bookGeometry} attach="geometry" dispose={null} />
}

/** New tabletop affordance; the existing tray/dice/cup/hourglass assets are untouched. */
export function FarkleScorebook({ side, active }: { side: number; active: boolean }) {
  const lid = useRef<Group>(null), open = useDiceUI(s => s.scoreOpen), { gl } = useThree()
  const reduced = useReducedMotion()
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return map
  }, [gl])
  useLayoutEffect(() => {
    paintScorebookCover(texture.image as HTMLCanvasElement)
    texture.needsUpdate = true
  }, [texture])
  useEffect(() => {
    let disposed = false
    // Canvas text needs repainting once the same local font used by the HUD loads.
    void document.fonts.load('700 70px "BusanDandiMyeongjo"').then(() => {
      if (!disposed) { paintScorebookCover(texture.image as HTMLCanvasElement); texture.needsUpdate = true }
    })
    return () => { disposed = true; texture.dispose(); gl.domElement.style.cursor = '' }
  }, [texture, gl])
  useFrame((_, delta) => {
    if (lid.current) lid.current.rotation.y += ((open ? -Math.PI * .88 : 0) - lid.current.rotation.y) * (reduced ? 1 : 1 - Math.exp(-10 * Math.min(delta, .1)))
  })
  return <group name="farkle-scorebook-prop" position={[-.76 * side, 1.08, .12 * side]} rotation={[-Math.PI / 2, 0, side < 0 ? Math.PI : 0]}
    onPointerDown={e => { if (e.button === 0 && active) { e.stopPropagation(); scenePointerOwners.set(e.pointerId, 'farkle-scorebook') } }}
    onClick={e => {
      e.stopPropagation()
      if (active && !Object.values(inputState).some(Boolean)) toggleScoreSheet()
    }} onPointerOver={e => { if (active) { e.stopPropagation(); gl.domElement.style.cursor = 'pointer' } }}
    onPointerOut={() => { gl.domElement.style.cursor = '' }}>
    <mesh scale={[.34, .47, .035]} castShadow receiveShadow><BookBox /><SurfaceMaterial kind="wood" color="#573b25" meters={.3} /></mesh>
    <mesh position={[0, 0, .022]} scale={[.305, .432, .021]}><BookBox /><meshStandardMaterial color="#d7c29b" roughness={.95} /></mesh>
    {pageEdges.map(z => <mesh key={z} position={[0, 0, z]} scale={[.31, .438, .001]}>
      <BookBox /><meshStandardMaterial color="#ead8b3" roughness={.95} />
    </mesh>)}
    <mesh position={[-.158, 0, .022]} scale={[.023, .443, .043]} castShadow>
      <BookBox /><meshStandardMaterial color="#3b281c" roughness={.8} />
    </mesh>
    <group ref={lid} position={[-.17, 0, .04]}>
      <mesh position={[.17, 0, 0]} scale={[.34, .47, .016]} castShadow><BookBox /><SurfaceMaterial kind="wood" color="#513520" meters={.3} /></mesh>
      <mesh position={[.17, 0, .009]}><planeGeometry args={[.315, .445]} /><meshStandardMaterial map={texture} roughness={.8} /></mesh>
    </group>
  </group>
}
