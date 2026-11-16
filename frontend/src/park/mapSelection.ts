const hostname = typeof location === 'undefined' ? '' : location.hostname
const localRenewal = (import.meta.env?.DEV || import.meta.env?.VITE_RENEWAL_LOCAL_PREVIEW === '1')
  && import.meta.env.MODE === 'park-renewal-integration'
  && ['localhost', '127.0.0.1'].includes(hostname)
const deployedRenewal = import.meta.env?.MODE === 'park-integration'
  && import.meta.env.VITE_PARK_RENEWAL_ENABLED === 'true'
  && ['dev.on-top.world', 'www.on-top.world'].includes(hostname)

export const RENEWAL_PARK_ENABLED = localRenewal || deployedRenewal
export const BALLOON_RIDE_ENABLED = deployedRenewal
  || (localRenewal && import.meta.env.DEV && import.meta.env.VITE_LOCAL_BALLOON === '1')
export const GENERATED_PARK_ENABLED = !RENEWAL_PARK_ENABLED && import.meta.env?.MODE === 'park-integration'
  && import.meta.env?.VITE_PARK_MAP === 'generated'
export const JUMPMAP_ENABLED = GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED
/** Captured before OAuth replaces the URL, for same-camera local comparison. */
export const RENEWAL_DISTANCE_LOD = RENEWAL_PARK_ENABLED
  && new URLSearchParams(location.search).get('distance-profile') !== 'before'
/** Local comparison against rendering the incomplete scene during entry. */
export const RENEWAL_GATE_STARTUP = RENEWAL_PARK_ENABLED
  && new URLSearchParams(location.search).get('gate-startup-profile') !== 'before'
