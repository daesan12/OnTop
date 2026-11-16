import { STATION_STAIRS } from '../../../park-renewal-preview/plan'

export const BALLOON_GATE_Z_OFFSET = STATION_STAIRS.zTop - .5

export function hasPassedBalloonGate(z: number, stationZ: number) {
  return z <= stationZ + BALLOON_GATE_Z_OFFSET
}
