import geometryUrl, { sceneUrl } from 'virtual:park-geometry'
import { hasProceduralProps, installBakedProps } from '../world/art/bakedProps'

let pending: Promise<void> | undefined
export function loadParkGeometry() {
  if (!pending && sceneUrl) {
    // Fetch/compile the scene module in parallel without executing its builders
    // until the prebuilt geometry has been installed.
    const preload = document.createElement('link')
    preload.rel = 'modulepreload'; preload.href = sceneUrl
    document.head.append(preload)
  }
  if (pending) return pending
  const warming = geometryUrl ? fetch(geometryUrl, {
    // The build emits a content-hashed URL, so a cached version cannot go stale.
    cache: 'force-cache', priority: 'low',
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
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
    performance.mark('park-geometry-fallback')
  }) : Promise.resolve()
  // A cold optional asset must not hold entry behind a slow download. Keep the
  // download alive for the next visit, but start the original scene after 150ms.
  let timer: ReturnType<typeof setTimeout>
  const budget = new Promise<void>(resolve => {
    timer = setTimeout(() => { performance.mark('park-geometry-deferred'); resolve() }, 150)
  })
  return pending = Promise.race([warming, budget]).finally(() => clearTimeout(timer))
}
