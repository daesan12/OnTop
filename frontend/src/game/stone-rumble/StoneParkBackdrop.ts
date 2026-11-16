import { Color, CubeCamera, LinearFilter, Scene, WebGLCubeRenderTarget, type WebGLRenderer } from 'three'

/** 먼 공원은 준비 중 한 번 찍고, 경기 중에는 시점 방향에 맞는 부분만 그린다. */
export class StoneParkBackdrop {
  private readonly target = new WebGLCubeRenderTarget(512, { minFilter: LinearFilter })
  private readonly camera = new CubeCamera(.1, 800, this.target)
  private readonly sky = new Color('#b8cad7')
  private valid = false
  readonly scene = new Scene()

  constructor() {
    // 세 층의 중간에서 촬영한다. 실제 발판과 캐릭터는 별도 장면에서 계속 렌더한다.
    this.camera.position.set(0, 12, 0)
    this.camera.updateMatrixWorld()
    this.scene.background = this.sky
  }

  prepare(renderer: WebGLRenderer, park: Scene) {
    if (this.valid) return
    const autoClear = renderer.autoClear
    const target = renderer.getRenderTarget()
    const face = renderer.getActiveCubeFace()
    const level = renderer.getActiveMipmapLevel()
    const xrEnabled = renderer.xr.enabled
    const mipmaps = this.target.texture.generateMipmaps
    try {
      renderer.autoClear = true
      this.camera.update(renderer, park)
      this.scene.background = this.target.texture
      this.valid = true
    } finally {
      // CubeCamera restores these only after all six sides render successfully.
      if (!this.valid) {
        renderer.setRenderTarget(target, face, level)
        renderer.xr.enabled = xrEnabled
        this.target.texture.generateMipmaps = mipmaps
      }
      renderer.autoClear = autoClear
    }
  }

  invalidate() { this.valid = false; this.scene.background = this.sky }
  dispose() { this.target.dispose() }
}
