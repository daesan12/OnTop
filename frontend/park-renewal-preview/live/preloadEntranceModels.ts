import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { models } from '../modelUrls'

export function preloadEntranceModels() {
  useLoader.preload(ParkAssetLoader, models.fortune!)
  useLoader.preload(ParkAssetLoader, models.main!)
}

export function preloadGateSurroundings() {
  for (const kind of ['lottery', 'bread', 'pigeon', 'cafe']) {
    useLoader.preload(ParkAssetLoader, models[kind]!)
  }
}
