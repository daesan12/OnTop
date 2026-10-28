import geometryUrl, { sceneUrl } from 'virtual:park-geometry'
import { hasProceduralProps, installBakedProps } from '../world/art/bakedProps'

let pending: Promise<void> | undefined
let deferred = false
let warmup: Promise<void> | undefined

/** Start only once scene code/maps have loaded; this file is for the next visit. */
export function warmParkGeometry() {
  if (!geometryUrl || !deferred || warmup) return
  warmup = fetch(geometryUrl, { cache: 'force-cache', priority: 'low',
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
  }).then(async response => {
    if (!response.ok) return
    await response.arrayBuffer()
    performance.mark('park-geometry-warmed')
  }).catch(() => {})
}
export function loadParkGeometry() {
  if (!pending && sceneUrl) {
    // Fetch/compile the scene module in parallel without executing its builders
    // until the prebuilt geometry has been installed.
    const preload = document.createElement('link')
    preload.rel = 'modulepreload'; preload.href = sceneUrl
    document.head.append(preload)
  }
  if (pending) return pending
  const controller = new AbortController()
  const warming = geometryUrl ? fetch(geometryUrl, {
    // The build emits a content-hashed URL, so a cached version cannot go stale.
    cache: 'force-cache', priority: 'low',
    signal: controller.signal,
  }).then(response => {
    if (!response.ok) throw new Error('공원 지오메트리를 읽을 수 없습니다.')
    return response.arrayBuffer()
  }).then(async buffer => {
    if (hasProceduralProps()) { performance.mark('park-geometry-cached'); return }
    // Explicit compression also works on hosts that don't gzip binary assets.
    // Accept an already-decoded response if the host provides Content-Encoding.
    const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    }
    const installed = await installBakedProps(buffer, true)
    performance.mark(installed ? 'park-geometry-ready' : 'park-geometry-cached')
  }).catch(() => {
    // The procedural source remains available if this optional cache fails.
    // Authentication and entry must still work without the prebuilt asset.
    if (!deferred) performance.mark('park-geometry-fallback')
  }) : Promise.resolve()
  // A cold optional asset must not hold entry behind a slow download.
  // Abort a slow transfer so it doesn't compete with critical scene downloads;
  // the render startup will warm the next visit once those resources are ready.
  let timer: ReturnType<typeof setTimeout>
  const budget = new Promise<void>(resolve => {
    timer = setTimeout(() => {
      deferred = true
      controller.abort()
      performance.mark('park-geometry-deferred')
      resolve()
    }, 150)
  })
  return pending = Promise.race([warming, budget]).finally(() => clearTimeout(timer))
}
