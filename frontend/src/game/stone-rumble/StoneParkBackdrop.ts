import {
  Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Quaternion, Scene, Vector2, Vector3,
  WebGLRenderTarget, type Camera, type WebGLRenderer,
} from 'three'

// The park is distant scenery. Cache it at half resolution and at most 15 fps;
// the players, aim and collapsing tiles still render at the canvas refresh rate.
export class StoneParkBackdrop {
  private readonly target = new WebGLRenderTarget(1, 1)
  private readonly quad = new Mesh(new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false }))
  private readonly size = new Vector2()
  private readonly lastEye = new Vector3(Infinity, Infinity, Infinity)
  private readonly lastRotation = new Quaternion()
  private lastDraw = -Infinity
  readonly scene = new Scene()
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2)

  constructor() {
    this.quad.position.z = -1
    this.scene.add(this.quad)
  }

  update(renderer: WebGLRenderer, park: Scene, camera: Camera, now: number) {
    renderer.getDrawingBufferSize(this.size)
    const width = Math.max(1, Math.ceil(this.size.x / 2)), height = Math.max(1, Math.ceil(this.size.y / 2))
    const resized = this.target.width !== width || this.target.height !== height
    if (!resized && (now - this.lastDraw < 1000 / 15 || (this.lastEye.distanceToSquared(camera.position) < .025
      && this.lastRotation.angleTo(camera.quaternion) < .008))) return
    this.target.setSize(width, height)
    const previousTarget = renderer.getRenderTarget(), previousClear = renderer.autoClear
    try {
      renderer.setRenderTarget(this.target)
      renderer.autoClear = true
      renderer.render(park, camera)
      this.lastEye.copy(camera.position)
      this.lastRotation.copy(camera.quaternion)
      this.lastDraw = now
    } finally {
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = previousClear
    }
  }

  invalidate() { this.lastDraw = -Infinity; this.lastEye.set(Infinity, Infinity, Infinity) }

  dispose() {
    this.target.dispose()
    this.quad.geometry.dispose()
    this.quad.material.dispose()
  }
}
