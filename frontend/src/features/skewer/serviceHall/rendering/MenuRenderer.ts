import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FoodModels, foodPositions, assembledFoodScale } from '../../foodModels'
import { validAssembly, INGREDIENTS } from '../../game'
import type { IngredientId } from '../../game'

/** One reusable offscreen renderer. Recipes are rendered once, never on animation frames. */
export class MenuRenderer {
  private readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-.48, .48, .17, -.17, .01, 10)
  private readonly foods = new FoodModels()
  private readonly environment: THREE.WebGLRenderTarget
  private readonly bamboo = new THREE.CylinderGeometry(.0055, .004, 1, 12)
  private readonly bambooMaterial = new THREE.MeshStandardMaterial({ color: '#946232', roughness: .65 })
  constructor() {
    this.renderer.setSize(960, 340, false); this.renderer.setPixelRatio(1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = .78; this.renderer.setClearColor(0x000000, 0)
    this.scene.add(new THREE.HemisphereLight('#fff7e6', '#6b5941', .9))
    const key = new THREE.DirectionalLight('#fff0dc', 2.2); key.position.set(-1, 2, 3)
    const rim = new THREE.DirectionalLight('#ffffff', .65); rim.position.set(1, 1, -1); this.scene.add(key, rim)
    const generator = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment()
    this.environment = generator.fromScene(room, .04); room.dispose(); generator.dispose()
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .25
    this.camera.position.set(0, .8, 2.5); this.camera.lookAt(0, .035, 0)
  }
  render(recipe: readonly IngredientId[]): string {
    if (!validAssembly(recipe) || !recipe.every(id => INGREDIENTS.some(i => i.id === id))) throw new Error('그릴 수 없는 꼬치 조합입니다.')
    const root = new THREE.Group(), positions = foodPositions(recipe), center = (positions[0] + positions.at(-1)!) / 2
    const stick = new THREE.Mesh(this.bamboo, this.bambooMaterial); stick.rotation.z = Math.PI / 2
    const length = positions.at(-1)! - positions[0] + .23; stick.scale.y = length; root.add(stick)
    recipe.forEach((id, index) => {
      const food = this.foods.create(id); food.scale.setScalar(assembledFoodScale(recipe)); food.position.x = positions[index] - center; root.add(food)
    })
    root.rotation.z = .08; this.scene.add(root)
    const halfWidth = Math.max(.41, length / 2 + .025), halfHeight = halfWidth * 340 / 960
    this.camera.left = -halfWidth; this.camera.right = halfWidth; this.camera.top = halfHeight + .015; this.camera.bottom = -halfHeight + .015; this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    const png = this.renderer.domElement.toDataURL('image/png')
    this.scene.remove(root)
    return png
  }
  dispose() { this.foods.dispose(); this.bamboo.dispose(); this.bambooMaterial.dispose(); this.environment.dispose(); this.renderer.dispose() }
}
