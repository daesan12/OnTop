import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Desktop contact shading; never used for the immersive XR render path. */
export class RestaurantPost {
  private readonly composer: EffectComposer
  private readonly ao: GTAOPass
  private readonly output = new OutputPass()
  private readonly renderPass: RenderPass
  private readonly ratio: number
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, radius: number, intensity = .85, ambientOcclusion = true) {
    this.ratio = Math.min(renderer.getPixelRatio(), 1.25)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 })
    this.composer = new EffectComposer(renderer, target); this.composer.setPixelRatio(this.ratio)
    this.renderPass = new RenderPass(scene, camera)
    this.ao = new GTAOPass(scene, camera, 1, 1)
    this.ao.updateGtaoMaterial({ radius, thickness: radius * .65, distanceExponent: 1.5, distanceFallOff: 1.0, samples: 8, scale: 1.0 })
    this.ao.updatePdMaterial({ radius: 4, samples: 8, rings: 2 })
    this.ao.blendIntensity = intensity
    this.composer.addPass(this.renderPass); if (ambientOcclusion) this.composer.addPass(this.ao); this.composer.addPass(this.output)
  }
  resize(width: number, height: number) {
    this.composer.setSize(width, height)
    // AO is the expensive pass: use a bounded 60% buffer, then denoise/upscale.
    this.ao.setSize(Math.max(1, Math.round(width * this.ratio * .60)), Math.max(1, Math.round(height * this.ratio * .60)))
  }
  render() { this.composer.render() }
  dispose() {
    this.ao.dispose(); this.ao.gtaoMaterial.dispose(); this.ao.blendMaterial.dispose()
    this.renderPass.dispose(); this.output.dispose(); this.composer.dispose()
  }
}
