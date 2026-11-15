// Decorations in the rendered scene. The shared map and physics do not consume these positions.
export const renewalAdSigns = [
  { id: 'fortune-right', x: 13, z: 91, yaw: -0.47 },
  { id: 'fitness-front-left', x: -30, z: 87.5, yaw: 0.3 },
  { id: 'gacha-left', x: 18, z: 26, yaw: -1.18 },
  { id: 'lake-north-rental', x: 73, z: -67, yaw: Math.PI },
  { id: 'pagoda-rental-right', x: -7, z: -58.5, yaw: 0 },
] as const

// These two trunks overlap the fitness and pagoda sign footprints.
const hiddenTreePositions = [[-29.6, 87.6], [-6.894, -58.598]] as const

export function isTreeBehindRenewalAdSign(x: number, z: number) {
  return hiddenTreePositions.some(([treeX, treeZ]) => Math.hypot(x - treeX, z - treeZ) < 0.01)
}
