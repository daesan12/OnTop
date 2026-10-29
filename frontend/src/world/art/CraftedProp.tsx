import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type BufferGeometry, type Group, type LOD, type Texture } from 'three'
import type { PropFinish } from './propGeometry'
import { SurfaceMaterial } from './SurfaceMaterial'
import { NightMaterial } from '../NightLighting'
import { metalGrain } from './ornamentTextures'
import { heritageTextures } from './heritageTextures'
import { useCanvasFont } from './useCanvasFont'

export type CraftedArt = Partial<Record<PropFinish, BufferGeometry>>
function HeritageMaterial({ finish }: { finish: string }) {
  const textures = useMemo(heritageTextures, [])
  const wood = finish === 'wood', gold = finish === 'gold' || finish === 'metal'
  if (finish === 'glow') return <meshStandardMaterial vertexColors emissive="#ffbc65" emissiveIntensity={.65} roughness={.7}/>
  return <meshStandardMaterial vertexColors map={gold ? undefined : wood ? textures.wood : textures.mineral}
    bumpMap={gold ? undefined : wood ? textures.wood : textures.mineral} bumpScale={wood ? .0014 : .0008}
    metalness={gold ? .38 : finish === 'paint' ? .08 : 0} roughness={gold ? .48 : wood ? .72 : .86}
    side={finish === 'tile' || finish === 'stone' ? DoubleSide : undefined}/>
}
function Batches({ art, shadow, environment, heritage, surfaceMaps }: { art: CraftedArt; shadow: boolean; environment?: Texture; heritage?: boolean; surfaceMaps?: Partial<Record<PropFinish, Texture>> }) {
  return <>{Object.entries(art).map(([finish, geometry]) => <mesh key={finish}
    castShadow={shadow && finish !== 'glow'} receiveShadow>
    <primitive object={geometry} attach="geometry" dispose={null} />
    {heritage && finish === 'paint' && surfaceMaps?.paint ? <meshBasicMaterial vertexColors map={surfaceMaps.paint} toneMapped={false} side={DoubleSide} alphaTest={.35}/>
      : surfaceMaps?.[finish as PropFinish] ? <meshStandardMaterial vertexColors map={surfaceMaps[finish as PropFinish]}
      bumpMap={finish === 'wood' ? surfaceMaps.wood : undefined} bumpScale={.001}
      roughness={.94} side={finish === 'paint' ? DoubleSide : undefined} alphaTest={.35}/>
      : heritage ? <HeritageMaterial finish={finish}/>
      : finish === 'wood' ? <SurfaceMaterial kind="wood" mapping="box" vertexColors meters={0.65} strength={environment ? .32 : .14} detail={environment ? .8 : .32} />
      : finish === 'paint' ? <meshPhysicalMaterial vertexColors envMap={environment} envMapIntensity={environment ? .45 : 1} metalness={0.2} roughness={0.32} clearcoat={0.3} clearcoatRoughness={0.26} />
      : finish === 'metal' ? <meshStandardMaterial vertexColors envMap={environment} envMapIntensity={environment ? .9 : 1} metalness={0.78} roughness={environment ? .43 : .3}
        roughnessMap={environment ? metalGrain : undefined} bumpMap={environment ? metalGrain : undefined} bumpScale={.0004} />
      : finish === 'gold' ? <meshStandardMaterial vertexColors envMap={environment} envMapIntensity={environment ? .65 : 1} metalness={0.7} roughness={0.42} />
      : finish === 'glow' ? <NightMaterial vertexColors color="#fff4d8" emission="#ffba67" strength={1.8} />
      : <meshStandardMaterial vertexColors roughness={finish === 'tile' ? 0.92 : 0.83} side={finish === 'tile' ? DoubleSide : undefined} />}
  </mesh>)}</>
}

/** Static, module-owned geometry; materials are component-owned and disposed on unmount. */
export function CraftedPropLod({ name, near, far, distance, environment, heritage, surfaceMaps }: {
  name: string; near: CraftedArt; far: CraftedArt; distance: number; environment?: Texture; heritage?: boolean; surfaceMaps?: Partial<Record<PropFinish, Texture>>
}) {
  const lod = useRef<LOD>(null), detail = useRef<Group>(null), distant = useRef<Group>(null)
  useLayoutEffect(() => {
    const object = lod.current!
    object.addLevel(detail.current!, 0)
    object.addLevel(distant.current!, distance, 0.15)
    return () => { object.levels.length = 0 }
  }, [distance])
  return <lOD name={name} ref={lod}>
    <group ref={detail} name={name + '-detail'}><Batches art={near} shadow environment={environment} heritage={heritage} surfaceMaps={surfaceMaps} /></group>
    <group ref={distant} name={name + '-distant'}><Batches art={far} shadow={false} environment={environment} heritage={heritage} surfaceMaps={surfaceMaps} /></group>
  </lOD>
}

/** Local canvas lettering, no image download or runtime font service. */
export function PropSign({ width, height, position, draw, rotation = [0, 0, 0], transparent = false, font }: {
  width: number; height: number; position: [number, number, number];
  rotation?: [number, number, number]; draw: (context: CanvasRenderingContext2D, w: number, h: number) => void; transparent?: boolean; font?: string
}) {
  const fontReady = useCanvasFont(font)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = Math.max(256, Math.round(1024 * height / width))
    draw(canvas.getContext('2d')!, canvas.width, canvas.height)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4
    return map
  }, [draw, width, height, fontReady])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh name={'prop-sign-' + draw.name} position={position} rotation={rotation}>
    <planeGeometry args={[width, height]} />
    {font ? <meshBasicMaterial map={texture} toneMapped={false} transparent={transparent} alphaTest={transparent ? .05 : 0}
      polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}/>
      : <meshStandardMaterial map={texture} roughness={0.68} metalness={0.08} transparent={transparent} alphaTest={transparent ? .05 : 0} />}
  </mesh>
}
