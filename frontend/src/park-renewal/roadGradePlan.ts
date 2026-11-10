import {HILL_HEIGHTS} from './hillRoute.ts'
/** Road-only targets. Existing facility/node/interaction anchors are not moved. */
export const ROAD_GRADE_HEIGHTS:Readonly<Record<string,number>>={
 forestBypass:4.5,westLower:5,restRampBend:12,...HILL_HEIGHTS,'lake-nw':4.4,lakeWestBend:4.4,'lake-west-north':4.4,
 lakeCurve0:4.45,lakeCurve1:4.5,lakeCurve2:4.55,lakeCurve3:4.6,
}
