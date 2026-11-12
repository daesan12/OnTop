import { COURSE, START } from './activeCourse'

// Prepare normal prop LODs at the course entrance and above the park, before
// the player reaches them. These cameras never control the player's view.
const high = COURSE.find(p => p.top >= 35)!
export const jumpmapPreparationViews = [
  { x: START.x, y: START.y, z: START.z },
  { x: high.x, y: high.top, z: high.z },
].map(p => ({
  position: [p.x, p.y + 3, p.z + 5] as const,
  target: [p.x, p.y + 1, p.z] as const,
}))
