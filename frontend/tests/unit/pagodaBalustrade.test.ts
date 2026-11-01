import { expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { pagodaBalustradeArt } from '../../src/layout-preview/pagodaBalustrade'
import { SETTINGS, SITES } from '../../src/layout-preview/layout'

it('돌 울타리 모서리 기단의 윗면이 중복되어 깊이 충돌을 일으키지 않는다', () => {
  const mesh = new Mesh(pagodaBalustradeArt.stone, new MeshBasicMaterial())
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const ray = new Raycaster(new Vector3(SITES.pagoda.x + x * (SETTINGS.pagoda.terraceHalf - .08),
      SITES.pagoda.floor + .221, SITES.pagoda.z + z * (SETTINGS.pagoda.terraceHalf - .13)), new Vector3(0, -1, 0))
    expect(ray.intersectObject(mesh).filter(hit => hit.distance < .002)).toHaveLength(1)
  }
  mesh.material.dispose()
})
