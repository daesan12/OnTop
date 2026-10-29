import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { BeveledBox } from '../../world/art/BeveledBox'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { inputState } from '../../world/inputOwnership'
import { useReducedMotion } from '../onecard/useReducedMotion'
import { toggleScoreSheet, useDiceUI } from './controls'

/** New tabletop affordance; the existing tray/dice/cup/hourglass assets are untouched. */
export function FarkleScorebook({ side, active }: { side: number; active: boolean }) {
  const lid = useRef<Group>(null), open = useDiceUI(s => s.scoreOpen), { gl } = useThree()
  const reduced = useReducedMotion()
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 384
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace
    return map
  }, [])
  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#302216'; ctx.fillRect(0, 0, 256, 384)
    ctx.strokeStyle = '#c9a365'; ctx.lineWidth = 3; ctx.strokeRect(13, 13, 230, 358)
    ctx.strokeStyle = '#876443'; ctx.lineWidth = 1; ctx.strokeRect(20, 20, 216, 344)
    ctx.fillStyle = '#ebce94'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = 'bold 60px Georgia'; ctx.fillText('T', 128, 92)
    ctx.font = 'bold 34px "Malgun Gothic", sans-serif'; ctx.fillText('점수표', 128, 190)
    ctx.font = '20px "Malgun Gothic", sans-serif'; ctx.fillText('펼쳐 보기', 128, 280)
    texture.needsUpdate = true
  }, [texture])
  useEffect(() => () => { texture.dispose(); gl.domElement.style.cursor = '' }, [texture, gl])
  useFrame((_, delta) => {
    if (lid.current) lid.current.rotation.y += ((open ? -Math.PI * .88 : 0) - lid.current.rotation.y) * (reduced ? 1 : 1 - Math.exp(-10 * Math.min(delta, .1)))
  })
  return <group name="farkle-scorebook-prop" position={[-.76 * side, 1.08, .12 * side]} rotation={[-Math.PI / 2, 0, side < 0 ? Math.PI : 0]}
    onClick={e => {
      e.stopPropagation()
      if (active && !Object.values(inputState).some(Boolean)) toggleScoreSheet()
    }} onPointerOver={e => { if (active) { e.stopPropagation(); gl.domElement.style.cursor = 'pointer' } }}
    onPointerOut={() => { gl.domElement.style.cursor = '' }}>
    <mesh scale={[.34, .47, .035]} castShadow receiveShadow><BeveledBox /><SurfaceMaterial kind="wood" color="#573b25" meters={.3} /></mesh>
    <mesh position={[0, 0, .022]} scale={[.31, .44, .025]}><BeveledBox /><meshStandardMaterial color="#e8d6b1" roughness={.95} /></mesh>
    <group ref={lid} position={[-.17, 0, .04]}>
      <mesh position={[.17, 0, 0]} scale={[.34, .47, .016]} castShadow><BeveledBox /><SurfaceMaterial kind="wood" color="#513520" meters={.3} /></mesh>
      <mesh position={[.17, 0, .009]}><planeGeometry args={[.315, .445]} /><meshStandardMaterial map={texture} roughness={.8} /></mesh>
    </group>
  </group>
}
