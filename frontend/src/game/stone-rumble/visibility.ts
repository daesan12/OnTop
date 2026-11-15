import { Material, MeshStandardMaterial, type Camera, type Scene, type WebGLRenderer } from 'three'

/** 공유 공원 재질을 건드리지 않고 경기용 조명/안개 설정을 적용한다. */
export function createStoneMaterial<T extends Material>(source: T): T {
  const material = source.clone()
  if ('fog' in material) material.fog = false
  if (material instanceof MeshStandardMaterial) material.envMapIntensity = 0
  return material
}

/** 공원 색은 유지하고 깊이만 비워 별도 조명의 경기장이 배경에 가려지지 않게 한다. */
export function renderStoneScene(renderer: WebGLRenderer, background: Scene, play: Scene, camera: Camera) {
  const autoClear = renderer.autoClear, autoReset = renderer.info.autoReset
  try {
    renderer.info.autoReset = false
    renderer.info.reset()
    renderer.autoClear = true
    renderer.render(background, camera)
    renderer.autoClear = false
    renderer.clearDepth()
    // 공원 렌더의 GPU 바인딩을 경기의 스킨 메시로 넘기지 않는다.
    // 합성 경계에서 관찰된 캐릭터 삼각형 누락을 방지한다.
    renderer.resetState()
    renderer.render(play, camera)
  } finally {
    renderer.autoClear = autoClear
    renderer.info.autoReset = autoReset
  }
}
