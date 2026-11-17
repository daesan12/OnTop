import { BALLOON_DOOR_OFFSET_X } from '../../../park-renewal-preview/plan'
import { renewalMap } from '../../park/renewalMap'
import type { Point } from './flight'

const station = renewalMap?.data.interactions.construction.find(site => site.id === 'balloon')
const doorX = station ? station.position[0] + BALLOON_DOOR_OFFSET_X : 0

// Mirrors BalloonStation on the server. The map anchor supplies the platform and deck height.
export const balloonEntrance = station && {
  x: doorX - .65,
  y: station.reachPosition[1],
  z: station.position[2],
}

export function canReachBalloonDoor(position: Point) {
  return !!station && !!balloonEntrance && position.x <= doorX
    && Math.hypot(position.x - balloonEntrance.x, position.z - balloonEntrance.z) <= 1.6
    && Math.abs(position.y - balloonEntrance.y) <= station.heightTolerance
}
