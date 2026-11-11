/** Only the explicit new-map build can switch scenes; ordinary builds keep the current service map. */
export const GENERATED_PARK_ENABLED = import.meta.env?.MODE === 'park-integration'
  && import.meta.env?.VITE_PARK_MAP === 'generated'

export const RENEWAL_PARK_ENABLED = import.meta.env?.DEV
  && import.meta.env.MODE === 'park-renewal-integration'
  && typeof location !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(location.hostname)
