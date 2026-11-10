import { Mesh, MeshBasicMaterial } from 'three'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'

/** Test-only capture of the canvas texture used by the real spatial guide. No product hooks. */
export function captureGuideTexture(): Promise<string> {
  return new Promise((resolve, reject) => {
    const original = RenderPass.prototype.render
    const timeout = setTimeout(() => { RenderPass.prototype.render = original; reject(new Error('VR 안내 렌더를 확인하지 못했어요.')) }, 5000)
    RenderPass.prototype.render = function (...args) {
      const panel = this.scene.getObjectByName('chef-vr-guide')
      if (panel instanceof Mesh && panel.material instanceof MeshBasicMaterial && panel.material.map) {
        clearTimeout(timeout); RenderPass.prototype.render = original
        resolve((panel.material.map.image as HTMLCanvasElement).toDataURL('image/png'))
      }
      return original.apply(this, args)
    }
  })
}
