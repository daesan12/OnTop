import { it } from 'vitest'

// Preserve the documented CLI entry while leaving manual diagnostics unloaded.
if (process.env.MOVEMENT_COMPARISON_DIR) {
  await import('../local-unit/movementQuality.test')
} else {
  it.skip('measures arrival blending versus source-tick interpolation under controlled jitter and stalls', () => {})
  it.skip('checks actual Bullet prediction with ordered jitter and application snapshot omissions', () => {})
}
