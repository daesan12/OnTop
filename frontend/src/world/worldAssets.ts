import { SIMPLE_MAP } from './art/mapRenderProfile'
import { RENEWAL_GATE_STARTUP } from '../park/mapSelection'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls } from './art/CharacterRig'
import parkPoster from '../assets/entry/adv_pickus_4.webp'
// Entry preloads this shared module; keep rig code here to avoid another scene RTT.
export { characterUrls, createCharacterRig } from './art/CharacterRig'
export { Canvas } from '@react-three/fiber'
export const woodTableUrl = '/art/props/wood-chair.glb'
export const mailboxUrl = '/art/mailbox/red-mailbox.glb?v=letter-lod-2'
export type Surface = 'wood' | 'stone' | 'bark' | 'grass'
export const leafMapUrl = '/art/zelkova-leaves.webp'
export const parkAdvertisementUrl = parkPoster
export const surfaceMapUrls = Object.fromEntries(
  (['wood', 'stone', 'bark', 'grass'] as const).map((kind) => [
    kind,
    ['color', 'normal', 'roughness'].map(
      (channel) => `/art/materials/${kind}-${channel}.webp`,
    ),
  ]),
) as Record<Surface, string[]>
export function preloadWorldAssets() {
  // Keep the gate's wood and stone maps in flight; other surfaces and props
  // load their textures when the matching meshes mount.
  const surfaces = RENEWAL_GATE_STARTUP ? ['wood', 'stone'] as const : ['wood', 'stone', 'grass'] as const
  if(!SIMPLE_MAP)for (const kind of surfaces)
    useLoader.preload(TextureLoader, surfaceMapUrls[kind])
  for (const url of SIMPLE_MAP || RENEWAL_GATE_STARTUP ? [] : [leafMapUrl, parkAdvertisementUrl])
    useLoader.preload(TextureLoader, url)
  useLoader.preload(ParkAssetLoader, characterUrls)
}
