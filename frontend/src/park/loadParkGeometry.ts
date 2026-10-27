import geometryUrl, { sceneUrl } from 'virtual:park-geometry'
import { installBakedProps } from '../world/art/bakedProps'

let pending: Promise<void> | undefined
export function loadParkGeometry() {
  if (!pending && sceneUrl) {
    // Fetch/compile the scene module in parallel without executing its builders
    // until the prebuilt geometry has been installed.
    const preload = document.createElement('link')
    preload.rel = 'modulepreload'; preload.href = sceneUrl
    document.head.append(preload)
  }
  return pending ??= (geometryUrl ? fetch(geometryUrl, {
    // The build emits a content-hashed URL, so a cached version cannot go stale.
    cache: 'force-cache', signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(2000) : undefined,
  }).then(response => {
    if (!response.ok) throw new Error('공원 지오메트리를 읽을 수 없습니다.')
    return response.arrayBuffer()
  }).then(async buffer => {
    // Explicit compression also works on hosts that don't gzip binary assets.
    // Accept an already-decoded response if the host provides Content-Encoding.
    const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    }
    await installBakedProps(buffer)
    performance.mark('park-geometry-ready')
  }).catch(() => {
    // The procedural source remains available if this optional cache fails.
    // Authentication and entry must still work without the prebuilt asset.
    performance.mark('park-geometry-fallback')
  }) : Promise.resolve())
}
