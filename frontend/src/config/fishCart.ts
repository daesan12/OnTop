/** Local coordinates of the code-built cart. Shared by its art, personal grill and camera. */
export const FISH_CART_GRILL = {
  center: [-0.66, 1.17, 0.03] as const,
  width: 1.2,
  depth: 0.7,
  thickness: 0.045,
  // Extruded plate top, including its 4 mm bevel; leave 2 mm for the personal overlay.
  surfaceY: 1.221,
  columns: [-0.4, 0, 0.4] as const,
  rows: [-0.175, 0.175] as const,
  mouldScale: 0.79,
  breadLength: 0.32,
}
