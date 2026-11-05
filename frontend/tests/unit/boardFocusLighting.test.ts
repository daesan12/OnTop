import { afterEach, describe, expect, it } from 'vitest'
import { DirectionalLight, Group, HemisphereLight, PerspectiveCamera, PointLight, Scene, Texture } from 'three'
import { applyOmokFocusLighting, OMOK_FOCUS_LIGHT, omokFocusLighting, parkLights, restoreParkLighting } from '../../src/world/boardFocusLighting'
import { OMOK_FOCUS_LAYER } from '../../src/world/omokCamera'

function park() {
  const scene = new Scene(), camera = new PerspectiveCamera()
  // Night park values from ParkSun / SimpleParkEnvironment / NightLighting.
  const sun = new DirectionalLight('#bdcde3', .65), fill = new HemisphereLight('#c8d6e8', '#a3b0c0', 1.35)
  const lamp = new PointLight('#fff0d8', 30), off = new PointLight('#fff0d8', 0)
  off.visible = false
  sun.target.position.set(4, 1, -2); sun.position.set(4, 34.75, 20.5)
  const lights = [sun, fill, lamp, off]
  scene.add(sun, fill, lamp, off)
  return { scene, camera, sun, fill, lamp, off, lights }
}
const focus = (camera: PerspectiveCamera) => camera.layers.set(OMOK_FOCUS_LAYER)
afterEach(() => { omokFocusLighting.requested = false })

describe('omok focus lighting', () => {
  it('uses the fixed noon profile only on omok top-view frames', () => {
    const { scene, camera, sun, fill, lamp, off, lights } = park()
    omokFocusLighting.requested = true; focus(camera)
    expect(applyOmokFocusLighting(scene, camera, lights)).toBe(true)
    expect(sun.intensity).toBe(OMOK_FOCUS_LIGHT.sun.intensity)
    expect(sun.color.getHexString()).toBe('fff3df')
    expect(sun.position.clone().sub(sun.target.position).normalize().toArray().map(v => +v.toFixed(3)))
      .toEqual(OMOK_FOCUS_LIGHT.sun.direction.toArray().map(v => +v.toFixed(3)))
    expect(fill.intensity).toBe(OMOK_FOCUS_LIGHT.fill.intensity)
    expect(fill.color.equals(OMOK_FOCUS_LIGHT.fill.sky)).toBe(true)
    expect(fill.groundColor.equals(OMOK_FOCUS_LIGHT.fill.ground)).toBe(true)
    expect([lamp.intensity, off.intensity]).toEqual([0, 0])
    // Light count and visibility are the park's: no program change on entry or exit.
    expect([sun.visible, fill.visible, lamp.visible, off.visible]).toEqual([true, true, true, false])
    restoreParkLighting(scene)
  })

  it('restores the exact park values after the draw so eased park lights continue from their own state', () => {
    const { scene, camera, sun, fill, lamp, lights } = park()
    const before = [sun.intensity, sun.color.getHex(), sun.position.toArray(), fill.intensity, fill.color.getHex(), fill.groundColor.getHex(), lamp.intensity]
    omokFocusLighting.requested = true; focus(camera)
    applyOmokFocusLighting(scene, camera, lights)
    restoreParkLighting(scene)
    expect([sun.intensity, sun.color.getHex(), sun.position.toArray(), fill.intensity, fill.color.getHex(), fill.groundColor.getHex(), lamp.intensity]).toEqual(before)
    restoreParkLighting(scene)
    expect(lamp.intensity).toBe(30)
  })

  it('leaves park, alkkagi and park-debris frames untouched', () => {
    const { scene, camera, sun, lamp, lights } = park()
    // Park view.
    omokFocusLighting.requested = false
    expect(applyOmokFocusLighting(scene, camera, lights)).toBe(false)
    // Alkkagi shares the focus layer but never requests the omok profile.
    focus(camera)
    expect(applyOmokFocusLighting(scene, camera, lights)).toBe(false)
    // A defeat shot returns the camera to the park layer within the same frame.
    omokFocusLighting.requested = true; camera.layers.set(0)
    expect(applyOmokFocusLighting(scene, camera, lights)).toBe(false)
    restoreParkLighting(scene)
    expect([sun.intensity, lamp.intensity]).toEqual([.65, 30])
  })

  it('finds only the park sun, fill and night lamps with a shallow scan of the scene root', () => {
    const { scene, camera, sun, fill, lamp, off } = park()
    scene.remove(lamp, off)
    for (const light of [sun, fill]) light.layers.mask = 1 | 1 << OMOK_FOCUS_LAYER
    lamp.userData.warmNightLight = off.userData.warmNightLight = true
    const night = new Group(); night.name = 'night-lighting'; night.add(lamp, off); scene.add(night)
    // Preview-only key light (park layer only) and a light nested in a game scene are not park lights.
    const preview = new DirectionalLight('#ffffff', 2.4), nested = new Group(), boardLight = new DirectionalLight('#ffffff', 2.5)
    boardLight.layers.mask = sun.layers.mask; nested.add(boardLight); scene.add(preview, nested)
    expect(parkLights(scene, [])).toEqual([sun, fill, lamp, off])
    omokFocusLighting.requested = true; focus(camera)
    applyOmokFocusLighting(scene, camera)
    expect([sun.intensity, fill.intensity, lamp.intensity, preview.intensity, boardLight.intensity]).toEqual([2.5, OMOK_FOCUS_LIGHT.fill.intensity, 0, 2.4, 2.5])
    restoreParkLighting(scene)
    expect([sun.intensity, fill.intensity, lamp.intensity]).toEqual([.65, 1.35, 30])
  })

  it('fixes environment reflections only when the scene uses them and redraws the park shadow on exit', () => {
    const { scene, camera, sun, lights } = park()
    scene.environmentIntensity = .08
    omokFocusLighting.requested = true; focus(camera)
    applyOmokFocusLighting(scene, camera, lights)
    expect(scene.environmentIntensity).toBe(.08)
    restoreParkLighting(scene)
    scene.environment = new Texture()
    applyOmokFocusLighting(scene, camera, lights)
    expect(scene.environmentIntensity).toBe(OMOK_FOCUS_LIGHT.environmentIntensity)
    restoreParkLighting(scene)
    expect(scene.environmentIntensity).toBe(.08)
    sun.castShadow = true; sun.shadow.needsUpdate = false
    omokFocusLighting.requested = false
    applyOmokFocusLighting(scene, camera, lights)
    expect(sun.shadow.needsUpdate).toBe(true)
  })
})
