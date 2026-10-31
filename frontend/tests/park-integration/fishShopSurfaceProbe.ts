import { _roots } from '@react-three/fiber'
import { Matrix4, Vector3 } from 'three'
import { fishBreadShopArt } from '../../src/world/art/luckyFacilityGeometry'
import { fishShopSeamSamples } from '../fixtures/fishShopSurfaces'

export function shopSurfaceProbe() {
  const { scene } = _roots.get(document.querySelector('canvas')!)!.store.getState()
  const shop = scene.getObjectByName('fish-bread-shop-building')!
  return { samples: fishShopSeamSamples(fishBreadShopArt.paint!),
    shops: scene.getObjectsByProperty('name', 'fish-bread-shop-building').length,
    meshes: shop.children.length, position: shop.matrixWorld.toArray() }
}

export function frameShop(offset = 0) {
  const state = _roots.get(document.querySelector('canvas')!)!.store.getState()
  state.setFrameloop('never')
  state.scene.updateMatrixWorld(true)
  const shop = state.scene.getObjectByName('fish-bread-shop-exterior')!
  const camera = state.camera
  const compact = state.size.width < 900
  camera.position.copy(new Vector3((compact ? 5.8 : 4.8) + offset, compact ? 6.3 : 5.3, compact ? 18 : 13).applyMatrix4(shop.matrixWorld))
  camera.lookAt(new Vector3(0, 2.9, 2).applyMatrix4(shop.matrixWorld))
  camera.updateMatrixWorld(true)
  state.gl.render(state.scene, camera)
  return { camera: camera.matrixWorld.toArray(), shop: new Matrix4().copy(shop.matrixWorld).toArray() }
}
