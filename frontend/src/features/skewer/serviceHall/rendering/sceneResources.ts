import { DirectionalLight, PointLight, SpotLight, type Object3D } from 'three'

/** renderer.dispose() 전에 장면이 소유한 광원의 별도 그림자 렌더 타깃도 해제한다. */
export function disposeRestaurantShadows(scene: Object3D) {
  scene.traverse(object => {
    if (object instanceof DirectionalLight || object instanceof PointLight || object instanceof SpotLight) object.shadow.dispose()
  })
}
