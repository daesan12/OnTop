import { expect, it, vi } from 'vitest'
import { DirectionalLight, PointLight, SpotLight, HemisphereLight, Scene, WebGLRenderTarget } from 'three'
import { disposeRestaurantShadows } from '../../src/features/skewer/serviceHall/rendering/sceneResources'

it('장면의 그림자 맵과 보조 타깃을 해제하고 다른 광원은 그대로 둔다', () => {
  const scene = new Scene(), disposals: ReturnType<typeof vi.fn>[] = []
  for (const light of [new DirectionalLight(), new PointLight(), new SpotLight()]) {
    const map = new WebGLRenderTarget(8, 8), pass = new WebGLRenderTarget(8, 8)
    light.shadow.map = map; light.shadow.mapPass = pass; scene.add(light)
    for (const target of [map, pass]) {
      const disposed = vi.fn(); target.addEventListener('dispose', disposed); disposals.push(disposed)
    }
  }
  const ambient = new HemisphereLight(); scene.add(ambient)
  disposeRestaurantShadows(scene)
  for (const disposed of disposals) expect(disposed).toHaveBeenCalledTimes(1)
  expect(ambient.parent).toBe(scene)
})
