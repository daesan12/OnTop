import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type BufferGeometry, type Group, type LOD, type Texture } from 'three'
import type { PropFinish } from './propGeometry'
import { SurfaceMaterial } from './SurfaceMaterial'
import { NightMaterial } from '../NightLighting'
import { metalGrain } from './ornamentTextures'

export type CraftedArt = Partial<Record<PropFinish, BufferGeometry>>
function Batches({ art, shadow, environment }: { art: CraftedArt; shadow: boolean; environment?: Texture }) {
  return <>{Object.entries(art).map(([finish, geometry]) => <mesh key={finish}
    castShadow={shadow && finish !== 'glow'} receiveShadow>
    <primitive object={geometry} attach="geometry" dispose={null} />
    {finish === 'wood' ? <SurfaceMaterial kind="wood" mapping="box" vertexColors meters={0.65} strength={environment ? .32 : .14} detail={environment ? .8 : .32} />
      : finish === 'paint' ? <meshPhysicalMaterial vertexColors envMap={environment} envMapIntensity={environment ? .45 : 1} metalness={0.2} roughness={0.32} clearcoat={0.3} clearcoatRoughness={0.26} />
      : finish === 'metal' ? <meshStandardMaterial vertexColors envMap={environment} envMapIntensity={environment ? .9 : 1} metalness={0.78} roughness={environment ? .43 : .3}
        roughnessMap={environment ? metalGrain : undefined} bumpMap={environment ? metalGrain : undefined} bumpScale={.0004} />
      : finish === 'gold' ? <meshStandardMaterial vertexColors envMap={environment} envMapIntensity={environment ? .65 : 1} metalness={0.7} roughness={0.42} />
      : finish === 'glow' ? <NightMaterial vertexColors color="#fff4d8" emission="#ffba67" strength={1.8} />
      : <meshStandardMaterial vertexColors roughness={finish === 'tile' ? 0.92 : 0.83} side={finish === 'tile' ? DoubleSide : undefined} />}
  </mesh>)}</>
}

/** Static, module-owned geometry; materials are component-owned and disposed on unmount. */
export function CraftedPropLod({ name, near, far, distance, environment }: {
  name: string; near: CraftedArt; far: CraftedArt; distance: number; environment?: Texture
}) {
  const lod = useRef<LOD>(null), detail = useRef<Group>(null), distant = useRef<Group>(null)
  useLayoutEffect(() => {
    const object = lod.current!
    object.addLevel(detail.current!, 0)
    object.addLevel(distant.current!, distance, 0.15)
    return () => { object.levels.length = 0 }
  }, [distance])
  return <lOD name={name} ref={lod}>
    <group ref={detail} name={name + '-detail'}><Batches art={near} shadow environment={environment} /></group>
    <group ref={distant} name={name + '-distant'}><Batches art={far} shadow={false} environment={environment} /></group>
  </lOD>
}

/** Local canvas lettering, no image download or runtime font service. */
export function PropSign({ width, height, position, draw, rotation = [0, 0, 0] }: {
  width: number; height: number; position: [number, number, number];
  rotation?: [number, number, number]; draw: (context: CanvasRenderingContext2D, w: number, h: number) => void
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = Math.max(256, Math.round(1024 * height / width))
    draw(canvas.getContext('2d')!, canvas.width, canvas.height)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4
    return map
  }, [draw, width, height])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh name={'prop-sign-' + draw.name} position={position} rotation={rotation}>
    <planeGeometry args={[width, height]} />
    <meshStandardMaterial map={texture} roughness={0.68} metalness={0.08} />
  </mesh>
}
