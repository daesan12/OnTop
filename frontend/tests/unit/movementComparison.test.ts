import { it } from 'vitest'

// Keep the entry point used by MovementPredictionFrontendTests without loading
// the trace runner during ordinary FE regression runs.
if (process.env.MOVEMENT_COMPARISON_DIR) {
  await import('../local-unit/movementComparison.test')
} else {
  it.skip('compares the unchanged presenter and predictor against identical real Bullet traces', () => {})
}
