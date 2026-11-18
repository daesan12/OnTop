import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { models } from '../modelUrls'

export function preloadEntranceModels() {
  useLoader.preload(ParkAssetLoader, models.main!)
  useLoader.preload(ParkAssetLoader, models.fortune!)
}

export function preloadGateSurroundings() {
  for (const kind of ['bread', 'pigeon', 'cafe']) {
    useLoader.preload(ParkAssetLoader, models[kind]!)
  }
}
