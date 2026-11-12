let pending: Promise<Response> | undefined

export function fetchStaticTerrain(url: string | URL) {
  performance.mark('park-static-load-start')
  return fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(15000) })
}

export function preloadRenewalTerrain() {
  return pending ??= fetchStaticTerrain(new URL('../original-park.bin.gz', import.meta.url))
}
