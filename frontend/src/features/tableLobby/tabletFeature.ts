/** Explicit rollout while the deployed server still auto-starts on READY_SET.
 * This selects a presentation, never a fake server or bypassed authentication. */
export const TABLET_ENABLED = import.meta.env.MODE === 'tablet' || import.meta.env.VITE_TABLET_LOBBY === 'true'
