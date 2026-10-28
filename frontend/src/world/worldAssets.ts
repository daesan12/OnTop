import { useLoader } from '@react-three/fiber'
import { ParkTextureLoader } from './art/ParkTextureLoader'
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
  for (const kind of ['wood', 'stone', 'grass'] as const)
    useLoader.preload(ParkTextureLoader, surfaceMapUrls[kind])
  for (const url of [leafMapUrl, parkAdvertisementUrl])
    useLoader.preload(ParkTextureLoader, url)
  useLoader.preload(ParkTextureLoader, '/art/granite-paving.webp')
  useLoader.preload(ParkAssetLoader, characterUrls)
}
