import { preloadRenewalTerrain } from '../../park-renewal-preview/static/terrainRequest'

let pending: Promise<typeof import('../../park-renewal-preview/live/RenewalWorld')> | undefined

export function loadRenewalParkWorld() {
  return pending ??= (async () => {
    void preloadRenewalTerrain().catch(() => {})
    void import('../../park-renewal-preview/static/store').catch(() => {})
    // Let the two prominent models decode alongside scene code.
    void import('../../park-renewal-preview/live/preloadEntranceModels').then(module => module.preloadEntranceModels()).catch(() => {})
    const facilities = fetch(new URL('../../park-renewal-preview/static/facilities.bin.gz', import.meta.url), {
      cache: 'force-cache', priority: 'low', signal: AbortSignal.timeout(10000),
    })
    void Promise.all([import('../../park-renewal-preview/static/facilities'), facilities])
      .then(([{ loadBakedFacilities }, response]) => loadBakedFacilities(response))
      .catch(error => {
        performance.mark('park-static-facilities-fallback')
        console.warn('[park-static] Using procedural facilities', error)
      })
    performance.mark('park-world-module-start')
    const world = await import('../../park-renewal-preview/live/RenewalWorld')
    performance.mark('park-world-module-ready')
    return world
  })().catch(error => {
    pending = undefined
    throw error
  })
}
