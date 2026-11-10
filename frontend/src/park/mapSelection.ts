/** Only the explicit new-map build can switch scenes; ordinary builds keep the current service map. */
export const GENERATED_PARK_ENABLED = import.meta.env?.MODE === 'park-integration'
  && import.meta.env?.VITE_PARK_MAP === 'generated'
/** Explicit local integration build. It cannot silently replace the deployed park. */
export const RENEWAL_PARK_ENABLED = ['park-renewal-integration','park-renewal-release'].includes(import.meta.env?.MODE)
export const JUMPMAP_ENABLED=GENERATED_PARK_ENABLED||RENEWAL_PARK_ENABLED
