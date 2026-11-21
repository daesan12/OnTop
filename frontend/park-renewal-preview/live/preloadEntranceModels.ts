import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { models } from '../modelUrls'

export function preloadEntranceModels() {
  useLoader.preload(ParkAssetLoader, models.main!)
  useLoader.preload(ParkAssetLoader, models.fortune!)
  useLoader.preload(ParkAssetLoader, models.lottery!)
}
