import { BoxGeometry, LatheGeometry, Vector2 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function buildGeometry() {
  const glass = new LatheGeometry([[.054, .052], [.068, .06], [.075, .08], [.075, .105], [.067, .132],
    [.05, .155], [.025, .18], [.009, .2], [.025, .222], [.05, .247], [.067, .27], [.075, .3], [.075, .325],
    [.068, .347], [.054, .355]].map(p => new Vector2(...p as [number, number])), 48)
  const post = new LatheGeometry([[.012, 0], [.012, .02], [.007, .035], [.006, .12], [.009, .15],
    [.009, .17], [.006, .2], [.007, .285], [.012, .3], [.012, .32]].map(p => new Vector2(...p as [number, number])), 12)
  return { glass, post }
}
let geometry: ReturnType<typeof buildGeometry> | undefined
export const craftGeometry = () => geometry ??= buildGeometry()
const frames = new Map<string, ReturnType<typeof mergeGeometries>>()
export function brassFrame(width: number, height: number) {
  const key = `${width}/${height}`
  if (!frames.has(key)) {
    const pieces = [new BoxGeometry(width, .0028, .003).translate(0, height / 2, 0),
      new BoxGeometry(width, .0028, .003).translate(0, -height / 2, 0),
      new BoxGeometry(.0028, height, .003).translate(width / 2, 0, 0),
      new BoxGeometry(.0028, height, .003).translate(-width / 2, 0, 0)]
    frames.set(key, mergeGeometries(pieces)); pieces.forEach(p => p.dispose())
  }
  return frames.get(key)!
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  if (geometry) Object.values(geometry).forEach(asset => asset.dispose())
  frames.forEach(frame => frame?.dispose()); frames.clear(); geometry = undefined
})
