import type { Object3D } from 'three'

/** Mutable slots are registered on model commit and cleared on unmount. */
export type ReinAnchorPair = { left: Object3D | null; right: Object3D | null }
export type ReinAnchors = { tow: ReinAnchorPair; harness: ReinAnchorPair[] }

export function createReinAnchors(): ReinAnchors {
  const pair = (): ReinAnchorPair => ({ left: null, right: null })
  return { tow: pair(), harness: Array.from({ length: 6 }, pair) }
}
