import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { models } from '../modelUrls'

export function preloadEntranceModels() {
  for (const kind of ['main', 'fortune']) useLoader.preload(ParkAssetLoader, models[kind]!)
}

export function preloadGateSurroundings() {
  for (const kind of ['lottery', 'bread', 'pigeon', 'cafe']) {
    useLoader.preload(ParkAssetLoader, models[kind]!)
  }
}
