import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// Geometry and animation buffer decoding must not block walking/render frames.
// The decoder is shared by every loader; one worker also serves serial residents.
if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && MeshoptDecoder.supported) {
  try { MeshoptDecoder.useWorkers(1) }
  catch { /* A blocked worker leaves the decoder's normal in-thread path intact. */ }
}

/** One loader class/cache for preload and consumers; decoder ships locally. */
export class ParkAssetLoader extends GLTFLoader {
  constructor() {
    super()
    this.setMeshoptDecoder(MeshoptDecoder)
  }
}
