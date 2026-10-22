export * from './parkProps'
export * from './gardenAdditions'
export * from './denseTrees'
export * from './notes'
import { AVATAR } from './avatar'

export * from './avatar'
export * from './emotes'
export * from './world'
export * from './parkLayout'
export * from './parkExpansion'
export * from './pagoda'
export * from './fitness'
export * from './telescopes'
export * from './plazaGarden'
export * from './lakeRocks'
export * from './parkAdvertising'
export { SWIMMING, lakeRadiusAt } from './parkLandforms'
export * from './quality'
export * from './gomoku'
export * from './table-seats'

export * from './environment'
export * from './staticStructures'
/** Local display budgets, never server capacity or gameplay authority. */
export const NETWORK = {
  maxClients: 64,
  interpolationMs: 120,
  emoteDurationMs: 1600,
} as const
/** Provisional overhead UI tuning, shared by all graphics presets. */
export const OVERHEAD = {
  maxVisible: 16,
  maxDistance: 20,
  telescopeMaxDistance: 220,
  headOffset: 0.65,
  bubbleDurationMs: 10000,
} as const
export const MOVEMENT = {
  walkSpeed: 6.25,
  runSpeed: 9.0,
  radius: 0.3,
  halfHeight: 0.48,
  gravity: -18,
  offset: 0.02,
  maxFallSpeed: -20,
  jumpSpeed: 6.2,
  stepHeight: 0.22,
} as const
export const CAMERA = {
  distance: 6.8,
  minDistance: 2.6,
  maxDistance: 10,
  pitch: 0.35,
  minPitch: -1.25,
  maxPitch: 1.35,
  focusHeight: 1.35 * AVATAR.scale,
  fov: 52,
  padding: 0.28,
  followSpeed: 12,
} as const
