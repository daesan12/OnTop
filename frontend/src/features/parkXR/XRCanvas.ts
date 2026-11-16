import * as THREE from 'three'

export class XRCanvas {
  readonly canvas = document.createElement('canvas')
  readonly texture = new THREE.CanvasTexture(this.canvas)
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly ray = new THREE.Raycaster()

  constructor(width: number, height: number, meters: number, overlay = true) {
    this.canvas.width = width
    this.canvas.height = height
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(meters, meters * height / width),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: !overlay, depthWrite: false, toneMapped: false }))
    this.mesh.renderOrder = overlay ? 10012 : 8
    this.mesh.visible = false
  }

  point(origin: THREE.Vector3, direction: THREE.Vector3) {
    if (!this.mesh.visible) return null
    this.ray.set(origin, direction)
    const uv = this.ray.intersectObject(this.mesh, false)[0]?.uv
    return uv ? { x: uv.x * this.canvas.width, y: (1 - uv.y) * this.canvas.height } : null
  }

  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}
