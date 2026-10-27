/** Shared with the park camera. While the wardrobe is open the camera zooms onto the own avatar and
 * places it at the stage centre (x/y in normalised device coordinates), filling `fill` of the screen height. */
export const wardrobeView = {
  active: false,
  blend: 0,
  x: -0.3,
  y: 0,
  fill: 0.7,
  /** Orbit angles the camera eases towards (front of the avatar on open, the saved view on close). */
  aim: null as { yaw: number; pitch: number } | null,
  /** Set on open: the camera rig swaps the aim for the nearest angle with a clear line to the avatar. */
  chooseClearView: false,
}
