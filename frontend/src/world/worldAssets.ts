import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls } from './art/characterAssets'
export const woodTableUrl = '/art/props/wood-chair.glb'
export const mailboxUrl = '/art/mailbox/red-mailbox.glb?v=letter-lod-2'
export type Surface = 'wood' | 'stone' | 'bark' | 'grass'
export const leafMapUrl = '/art/zelkova-leaves.webp'
export const parkAdvertisementUrl = '/art/advertisements/adv_pickus_4.webp'
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
    useLoader.preload(TextureLoader, surfaceMapUrls[kind])
  for (const url of [leafMapUrl, parkAdvertisementUrl])
    useLoader.preload(TextureLoader, url)
  useLoader.preload(ParkAssetLoader, woodTableUrl)
  useLoader.preload(ParkAssetLoader, mailboxUrl)
  useLoader.preload(ParkAssetLoader, characterUrls)
}
