import { preloadRenewalTerrain } from '../../park-renewal-preview/static/terrainRequest'

let pending: Promise<typeof import('../../park-renewal-preview/live/RenewalWorld')> | undefined

export function loadRenewalParkWorld() {
  return pending ??= (async () => {
    // Give the terrain request a head start before the scene import queues its dependencies.
    void preloadRenewalTerrain().catch(() => {})
    performance.mark('park-world-module-start')
    const worldModule = import('../../park-renewal-preview/live/RenewalWorld')
    // These modules construct static art while evaluating. Start that work with
    // terrain/auth loading instead of importing them during the first walk.
    // They remain optional: an unfinished prefetch never holds the entry gate.
    void Promise.allSettled([
      import('../../park-renewal-preview/ScenicDetails'),
      import('../../park-renewal-preview/Buildings'),
    ])
    // Reuse the exact cached stone surfaces when distant landmarks mount.
    // Yield between scales; this optional preparation never gates entry.
    void import('../world/art/StonePagoda').then(async module => {
      await new Promise(resolve => setTimeout(resolve, 0))
      module.prebuildStaticSurfaces()
      await new Promise(resolve => setTimeout(resolve, 0))
      module.prebuildStaticSurfaces([.8])
    }).catch(() => {})
    void import('../../park-renewal-preview/static/store').catch(() => {})
    // Start all first-frame model requests while the world module loads.
    const entranceModels = import('../../park-renewal-preview/live/preloadEntranceModels')
    void entranceModels.then(module => module.preloadEntranceModels()).catch(() => {})
    const facilities = fetch(new URL('../../park-renewal-preview/static/facilities.bin.gz', import.meta.url), {
      cache: 'force-cache', priority: 'low', signal: AbortSignal.timeout(10000),
    })
    void Promise.all([import('../../park-renewal-preview/static/facilities'), facilities])
      .then(([{ loadBakedFacilities }, response]) => loadBakedFacilities(response))
      .catch(error => {
        performance.mark('park-static-facilities-fallback')
        console.warn('[park-static] Using procedural facilities', error)
      })
    const world = await worldModule
    performance.mark('park-world-module-ready')
    return world
  })().catch(error => {
    pending = undefined
    throw error
  })
}
