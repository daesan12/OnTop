/** Build-time selection, never inferred from a server reply or URL query. */
export const GENERATED_PARK_ENABLED = import.meta.env?.VITE_PARK_MAP === 'generated'
