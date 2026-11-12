/** Only the explicit new-map build can switch scenes; ordinary builds keep the current service map. */
export const GENERATED_PARK_ENABLED = import.meta.env?.MODE === 'park-integration'
  && import.meta.env?.VITE_PARK_MAP === 'generated'

export const RENEWAL_PARK_ENABLED = import.meta.env?.DEV
  && import.meta.env.MODE === 'park-renewal-integration'
  && typeof location !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(location.hostname)

export const JUMPMAP_ENABLED = GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED
/** Captured before OAuth replaces the URL, for same-camera local comparison. */
export const RENEWAL_DISTANCE_LOD = RENEWAL_PARK_ENABLED
  && new URLSearchParams(location.search).get('distance-profile') !== 'before'
/** Local comparison against rendering the incomplete scene during entry. */
export const RENEWAL_GATE_STARTUP = RENEWAL_PARK_ENABLED
  && new URLSearchParams(location.search).get('gate-startup-profile') !== 'before'
