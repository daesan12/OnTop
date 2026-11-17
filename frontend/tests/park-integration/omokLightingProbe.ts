// Dev-server-only inspection helper for the omok day/night lighting regression. Never bundled with the app.
import { _roots } from '@react-three/fiber'
import { Vector3, type DirectionalLight, type HemisphereLight, type Light, type WebGLRenderer } from 'three'
import { environmentConfig, environmentFrame } from '../../src/world/environmentState'
import { omokCamera } from '../../src/game/cameraState'
import { GOMOKU } from '../../src/config'

const root = () => _roots.get(document.querySelector('canvas')!)!.store.getState()
const pin = { hour: null as number | null }
let pinned = false
/** Hold the park clock at an in-game hour. The epoch getter wins over later WORLD_TIME_STATE samples. */
export function pinParkHour(hour: number | null) {
  pin.hour = hour
  if (pinned) return
  pinned = true
  let epoch = environmentConfig.epochMs
  Object.defineProperty(environmentConfig, 'epochMs', {
    configurable: true,
    get: () => pin.hour === null ? epoch : environmentFrame.serverTime - pin.hour / 24 * environmentConfig.dayDurationMs,
    set: (value: number) => { epoch = value },
  })
}

function lights() {
  const { scene } = root()
  let sun: DirectionalLight | undefined, fill: HemisphereLight | undefined
  const points: Light[] = []
  scene.traverse(object => {
    const light = object as Light
    if (!light.isLight) return
    if (light.type === 'DirectionalLight') sun ??= light as DirectionalLight
    else if (light.type === 'HemisphereLight') fill ??= light as HemisphereLight
    else if (light.type === 'PointLight' && light.userData.warmNightLight) points.push(light)
  })
  return { sun, fill, points }
}
const round = (value: number) => Math.round(value * 1000) / 1000
function read(found: ReturnType<typeof lights>) {
  const { camera, gl } = root(), { sun, fill, points } = found
  const direction = sun ? sun.position.clone().sub(sun.target.position).normalize() : new Vector3()
  return {
    hour: round(environmentFrame.hour), night: round(environmentFrame.night), cameraLayers: camera.layers.mask,
    exposure: round(gl.toneMappingExposure),
    sun: round(sun?.intensity ?? -1), sunColor: sun?.color.getHexString() ?? '', sunY: round(direction.y),
    fill: round(fill?.intensity ?? -1), fillColor: fill?.color.getHexString() ?? '',
    points: round(points.reduce((sum, light) => sum + (light.visible ? light.intensity : 0), 0)),
    visiblePoints: points.filter(light => light.visible).length,
  }
}
export function lightingState() { return read(lights()) }

/** Records the light values at every actual draw of the park canvas. */
let log: ReturnType<typeof read>[] = [], original: WebGLRenderer['render'] | null = null
export function startRenderLog() {
  const { gl } = root()
  log = []
  if (original) return
  original = gl.render
  const found = lights()
  gl.render = function (scene, camera) {
    if (camera === root().camera) log.push(read(found))
    return original!.call(this, scene, camera)
  }
}
export function takeRenderLog() {
  const { gl } = root()
  if (original) gl.render = original
  original = null
  return log
}

/** Inner playing-surface rectangle in CSS pixels, away from the frame and the stone bowls. */
export function boardWoodRect(game: 'omok' | 'alkkagi' = 'omok') {
  const { scene, camera, gl } = root()
  const board = scene.getObjectByName(game === 'alkkagi' ? 'alkkagi-world-board' : 'omok-board-' + omokCamera.anchorId)!
  const rect = gl.domElement.getBoundingClientRect(), half = game === 'alkkagi' ? 1.4 : GOMOKU.boardSpan * .45 / 2
  const points = [[-half, -half], [half, half]].map(([x, z]) => {
    const p = board.localToWorld(new Vector3(x, .012, z)).project(camera)
    return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2]
  })
  return { x0: Math.min(points[0]![0]!, points[1]![0]!), y0: Math.min(points[0]![1]!, points[1]![1]!),
    x1: Math.max(points[0]![0]!, points[1]![0]!), y1: Math.max(points[0]![1]!, points[1]![1]!) }
}
