import { useLoader } from '@react-three/fiber'
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, CanvasTexture, type Texture } from 'three'
import { seeded } from '../../../world/art/Instances'

// The photoreal material pass is retained only for the hourglass.
export const craftMapUrls = ['/art/farkle/walnut-albedo-v1.webp']
export const preloadCraftMaps = () => useLoader.preload(TextureLoader, craftMapUrls)
const prepared = new WeakMap<Texture, Texture>()
const derivativeMaps = new Set<Texture>()

function useCraftMap(index: number) {
  const maps = useLoader(TextureLoader, craftMapUrls), map = maps[index]!
  let bump = prepared.get(map)
  if (!bump) {
    map.colorSpace = SRGBColorSpace; map.anisotropy = 8; map.wrapS = map.wrapT = RepeatWrapping
    bump = map.clone(); bump.colorSpace = NoColorSpace; bump.needsUpdate = true
    prepared.set(map, bump)
    derivativeMaps.add(bump)
  }
  return { map, bumpMap: bump }
}

function noiseMaps(seed: number, weave = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(512, 512), random = seeded(seed)
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4
    const thread = weave ? Math.sin(x * Math.PI / 2) * 14 + Math.sin(y * Math.PI / 2) * 14 : 0
    const value = 160 + Math.floor(random() * 48) + thread
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  const map = new CanvasTexture(canvas); map.wrapS = map.wrapT = RepeatWrapping; map.anisotropy = 4
  return map
}
let grain: ReturnType<typeof buildGrain> | undefined
function buildGrain() {
  return { felt: noiseMaps(391, true), metal: noiseMaps(829), paper: noiseMaps(127, true) }
}
export const craftGrain = () => grain ??= buildGrain()

/** Local image textures and subtle physical relief, shared by every game table. */
export function WalnutMaterial({ color = '#e8d3b4', vertexColors = false }: { color?: string; vertexColors?: boolean }) {
  const maps = useCraftMap(0)
  return <meshPhysicalMaterial {...maps} color={color} bumpScale={.0011} roughnessMap={craftGrain().metal}
    roughness={.7} clearcoat={.24} clearcoatRoughness={.3} envMapIntensity={.9} vertexColors={vertexColors} />
}
export function AgedBrassMaterial({ dark = false, highlight = false }: { dark?: boolean; highlight?: boolean }) {
  const grain = craftGrain().metal
  return <meshStandardMaterial color={dark ? '#776144' : '#b99b5d'} metalness={.84}
    roughness={dark ? .58 : .42} roughnessMap={grain} bumpMap={grain} bumpScale={.00025}
    envMapIntensity={1.5} emissive="#9d7433" emissiveIntensity={highlight ? .11 : 0} />
}

// TextureLoader owns image maps for the lifetime of its shared cache. These maps are local data.
if (import.meta.hot) import.meta.hot.dispose(() => {
  if (grain) Object.values(grain).forEach(map => map.dispose())
  derivativeMaps.forEach(map => map.dispose()); derivativeMaps.clear()
  grain = undefined
})
