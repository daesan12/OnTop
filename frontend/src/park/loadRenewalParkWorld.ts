import { preloadRenewalTerrain } from '../../park-renewal-preview/static/terrainRequest'
import { requestRenewalMap } from './renewalMapRequest'

let pending: Promise<typeof import('../../park-renewal-preview/live/RenewalWorld')> | undefined

export function loadRenewalParkWorld() {
  return pending ??= (async () => {
    // Give the terrain request a head start before the scene import queues its dependencies.
    void preloadRenewalTerrain().catch(() => {})
    performance.mark('park-world-module-start')
    const worldModule = import('../../park-renewal-preview/live/RenewalWorld')
    void import('../../park-renewal-preview/static/store').catch(() => {})
    // Fetch the scene and collision map before starting the gate model transfers.
    const entranceModels = import('../../park-renewal-preview/live/preloadEntranceModels')
    void Promise.all([entranceModels, requestRenewalMap()])
      .then(([module]) => module.preloadEntranceModels()).catch(() => {})
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
    // Start the other gate models while the canvas and player state finish preparing.
    void entranceModels.then(module => module.preloadGateSurroundings()).catch(() => {})
    return world
  })().catch(error => {
    pending = undefined
    throw error
  })
}
