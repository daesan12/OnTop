let pending: Promise<ArrayBuffer> | undefined

export async function fetchStaticTerrain(url: string | URL) {
  performance.mark('park-static-load-start')
  const response = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw Error('Static park HTTP ' + response.status)
  let buffer = await response.arrayBuffer()
  performance.mark('park-static-body-ready')
  // Some servers already decompress the response based on Content-Encoding.
  const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  }
  performance.mark('park-static-inflated')
  return buffer
}

export function preloadRenewalTerrain() {
  return pending ??= fetchStaticTerrain(new URL('../original-park.bin.gz', import.meta.url))
}

export function takeRenewalTerrain() {
  const archive = preloadRenewalTerrain()
  pending = undefined
  return archive
}
