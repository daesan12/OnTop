import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { models } from '../modelUrls'

export function preloadEntrancePavilion() {
  useLoader.preload(ParkAssetLoader, models.main!)
}

export function preloadGateSurroundings() {
  for (const kind of ['bread', 'pigeon', 'cafe']) {
    useLoader.preload(ParkAssetLoader, models[kind]!)
  }
}
