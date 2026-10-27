/** Explicit rollout: tablet configures MANUAL tables, while the default UI keeps AUTO compatibility.
 * This selects a presentation, never a fake server or bypassed authentication. */
export const TABLET_ENABLED = import.meta.env.MODE === 'tablet' || import.meta.env.VITE_TABLET_LOBBY === 'true'
