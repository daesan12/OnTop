import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/** One loader class/cache for preload and consumers; decoder ships locally. */
export class ParkAssetLoader extends GLTFLoader {
  constructor() {
    super()
    this.setMeshoptDecoder(MeshoptDecoder)
  }
}
