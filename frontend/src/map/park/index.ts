import { PARK_DEFINITION } from './definition'
import { resolveParkLayout } from './resolve'
export { PARK_DEFINITION,type ParkDefinition } from './definition'
export { resolveParkLayout } from './resolve'
export const PARK_LAYOUT=resolveParkLayout(PARK_DEFINITION)
export const PARK_DATA=PARK_LAYOUT.data
export type ParkMapData=typeof PARK_DATA
export type {MapCollision,MapObstacle} from './collision'
