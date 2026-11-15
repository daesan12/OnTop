import {
  Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Quaternion, Scene, Vector2, Vector3,
  WebGLRenderTarget, type Camera, type WebGLRenderer,
} from 'three'

const drawInterval = 1000 / 15

// The park is distant scenery. Cache it at half resolution and at most 15 fps;
// the players, aim and collapsing tiles still render at the canvas refresh rate.
export class StoneParkBackdrop {
  private readonly target = new WebGLRenderTarget(1, 1)
  private readonly quad = new Mesh(new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false }))
  private readonly size = new Vector2()
  private readonly lastEye = new Vector3(Infinity, Infinity, Infinity)
  private readonly lastRotation = new Quaternion()
  private readonly observedEye = new Vector3()
  private readonly observedRotation = new Quaternion()
  private lastMotionAt = -Infinity
  private pendingSettle = false
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
    if (this.observedEye.distanceToSquared(camera.position) > 1e-10
      || Math.abs(this.observedRotation.dot(camera.quaternion)) < 1 - 1e-12) {
      this.lastMotionAt = now
      this.pendingSettle = true
    }
    this.observedEye.copy(camera.position)
    this.observedRotation.copy(camera.quaternion)
    const settled = this.pendingSettle && now - this.lastMotionAt >= drawInterval
    const positionChange = this.lastEye.distanceToSquared(camera.position)
    const rotationChange = Math.abs(this.lastRotation.dot(camera.quaternion))
    const needsDraw = positionChange >= .025 || this.lastRotation.angleTo(camera.quaternion) >= .008
    // Flush the last damped camera pose after motion drops below the cache thresholds.
    const needsSettledDraw = settled && (positionChange > 1e-10 || rotationChange < 1 - 1e-12)
    if (!resized && now - this.lastDraw < drawInterval) return
    if (settled) this.pendingSettle = false
    if (!resized && !needsDraw && !needsSettledDraw) return
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
