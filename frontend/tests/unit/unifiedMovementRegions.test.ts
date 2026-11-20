import { it } from 'vitest'

// UnifiedMovementFrontendTests invokes this path when exporting FE trajectories.
if (process.env.UNIFIED_MOVEMENT_DIR) {
  await import('../local-unit/unifiedMovementRegions.test')
} else {
  it.skip('feeds actual Rapier region trajectories into the Java validator', () => {})
}
