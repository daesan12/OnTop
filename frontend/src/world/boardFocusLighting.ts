import { useFrame } from '@react-three/fiber'
import { Color, Vector3, type Camera, type DirectionalLight, type HemisphereLight, type Light, type Object3D, type Scene } from 'three'
import { SIMPLE_MAP } from './art/mapRenderProfile'
import { simpleEnvironmentPalette } from './simpleEnvironmentPalette'
import { OMOK_FOCUS_LAYER } from './omokCamera'

/** Rendering only. CameraRig raises this on frames that draw the omok play or spectator top view. */
export const omokFocusLighting = { requested: false }

/**
 * The omok top view keeps park noon whatever the park hour is: the board and stones look the same at
 * night, dawn and dusk. Only values change; light count, visibility and layers stay as the park set them,
 * so no material program is rebuilt when the view switches.
 */
export const OMOK_FOCUS_LIGHT = {
  sun: { intensity: 2.5, color: new Color('#fff3df'), direction: new Vector3(0, 1, .3).normalize(), distance: 75 },
  fill: SIMPLE_MAP
    ? { intensity: simpleEnvironmentPalette.dayFill, sky: new Color(simpleEnvironmentPalette.dayLight), ground: new Color(simpleEnvironmentPalette.dayGround) }
    : { intensity: 1.57, sky: new Color('#e4edf6'), ground: new Color('#747464') },
  environmentIntensity: .5,
}

type Saved = { intensity: number; color: Color; ground: Color; position: Vector3 }
const saved = new WeakMap<Light, Saved>()
const overridden: Light[] = [], found: Light[] = []
let savedEnvironment = 0, applied = false, wasApplied = false

const isHemisphere = (light: Object3D): light is HemisphereLight => (light as HemisphereLight).isHemisphereLight === true
const isDirectional = (light: Object3D): light is DirectionalLight => (light as DirectionalLight).isDirectionalLight === true
const PARK_LIGHT_LAYERS = 1 | 1 << OMOK_FOCUS_LAYER

/**
 * The park's day/night lights, found without touching their components: ParkSun's sun and the
 * environment fill sit at the scene root on the park + focus layers, NightLighting's lamps in its group.
 * A shallow scan of the scene root only, on omok frames only.
 */
export function parkLights(scene: Scene, out: Light[] = found) {
  out.length = 0
  for (const child of scene.children) {
    if ((isDirectional(child) || isHemisphere(child)) && child.layers.mask === PARK_LIGHT_LAYERS) out.push(child)
    else if (child.name === 'night-lighting')
      for (const lamp of child.children) if ((lamp as Light).isLight && lamp.userData.warmNightLight) out.push(lamp as Light)
  }
  return out
}

/** Runs after CameraRig and before the draw. Returns whether this frame uses the omok profile. */
export function applyOmokFocusLighting(scene: Scene, camera: Camera, lights?: Iterable<Light>) {
  const active = omokFocusLighting.requested && camera.layers.mask === 1 << OMOK_FOCUS_LAYER
  if (!active) {
    // The park shadow map may hold the fixed sun; redraw it with the park sun on the first park frame.
    if (wasApplied) for (const light of lights ?? parkLights(scene)) if (isDirectional(light) && light.castShadow) light.shadow.needsUpdate = true
    wasApplied = false
    return false
  }
  const { sun, fill } = OMOK_FOCUS_LIGHT
  for (const light of lights ?? parkLights(scene)) {
    let copy = saved.get(light)
    if (!copy) saved.set(light, copy = { intensity: 0, color: new Color(), ground: new Color(), position: new Vector3() })
    copy.intensity = light.intensity
    copy.color.copy(light.color)
    copy.position.copy(light.position)
    overridden.push(light)
    if (isHemisphere(light)) {
      copy.ground.copy(light.groundColor)
      light.intensity = fill.intensity
      light.color.copy(fill.sky)
      light.groundColor.copy(fill.ground)
    } else if (isDirectional(light)) {
      light.intensity = sun.intensity
      light.color.copy(sun.color)
      // ParkSun keeps the target at the visitor; only the direction from it changes.
      light.position.copy(light.target.position).addScaledVector(sun.direction, sun.distance)
    } else light.intensity = 0 // Night lamps stay visible at zero, keeping the shader light count.
  }
  savedEnvironment = scene.environmentIntensity
  if (scene.environment) scene.environmentIntensity = OMOK_FOCUS_LIGHT.environmentIntensity
  applied = wasApplied = true
  return true
}

/** Runs after the draw, so park updates on the next frame continue from their own values. */
export function restoreParkLighting(scene: Scene) {
  if (!applied) return
  for (const light of overridden) {
    const copy = saved.get(light)
    if (!copy) continue
    light.intensity = copy.intensity
    light.color.copy(copy.color)
    light.position.copy(copy.position)
    if (isHemisphere(light)) light.groundColor.copy(copy.ground)
  }
  overridden.length = 0
  scene.environmentIntensity = savedEnvironment
  applied = false
}

/** Mount next to the scene's own render pass (priority 1): applies at 0.5, restores at 2. */
export function OmokFocusLighting() {
  useFrame(({ scene, camera }) => { applyOmokFocusLighting(scene, camera) }, .5)
  useFrame(({ scene }) => restoreParkLighting(scene), 2)
  return null
}
