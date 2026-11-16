import { Color, CubeCamera, LinearFilter, Scene, WebGLCubeRenderTarget, type PerspectiveCamera, type WebGLRenderer } from 'three'

/** 먼 공원은 준비 중 한 번 찍고, 경기 중에는 시점 방향에 맞는 부분만 그린다. */
export class StoneParkBackdrop {
  private readonly target = new WebGLCubeRenderTarget(512, { minFilter: LinearFilter })
  private readonly camera = new CubeCamera(.1, 800, this.target)
  private readonly sky = new Color('#b8cad7')
  private face = 0
  readonly scene = new Scene()

  constructor() {
    // 세 층의 중간에서 촬영한다. 실제 발판과 캐릭터는 별도 장면에서 계속 렌더한다.
    this.camera.position.set(0, 12, 0)
    this.camera.updateMatrixWorld()
    this.scene.background = this.sky
  }

  captureFace(renderer: WebGLRenderer, park: Scene) {
    if (this.face >= this.camera.children.length) return true
    if (this.camera.coordinateSystem !== renderer.coordinateSystem) {
      this.camera.coordinateSystem = renderer.coordinateSystem
      this.camera.updateCoordinateSystem()
    }
    this.camera.updateMatrixWorld()
    const autoClear = renderer.autoClear
    const target = renderer.getRenderTarget()
    const face = renderer.getActiveCubeFace()
    const level = renderer.getActiveMipmapLevel()
    const xrEnabled = renderer.xr.enabled
    try {
      renderer.autoClear = true
      renderer.xr.enabled = false
      renderer.setRenderTarget(this.target, this.face)
      renderer.render(park, this.camera.children[this.face] as PerspectiveCamera)
      this.face++
      return this.face === this.camera.children.length
    } finally {
      renderer.setRenderTarget(target, face, level)
      renderer.xr.enabled = xrEnabled
      renderer.autoClear = autoClear
    }
  }

  showCapture() {
    if (this.face !== this.camera.children.length) return
    this.target.texture.needsPMREMUpdate = true
    this.scene.background = this.target.texture
  }
  invalidate() { this.face = 0; this.scene.background = this.sky }
  dispose() { this.target.dispose() }
}
