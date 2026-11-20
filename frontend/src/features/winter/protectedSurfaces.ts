import { TABLES, GOMOKU, tableScale } from '../../park/mapConfig'
import { BUNG_GRILL } from '../bungeoppang/bungeoppangView'
import { trayPoint } from '../bungeoppang/layoutV5'
import type { SnowProtectedArea } from './roofSnow'

/** Protect the six moulds, both tray shelves and nearby working space, including their raised rims. */
export const winterCookingSurface: SnowProtectedArea = {
  x: BUNG_GRILL.center[0], z: BUNG_GRILL.center[2], radius: 3.1,
  topY: Math.max(BUNG_GRILL.top, trayPoint(9)[1]) + 1,
}
export const winterProtectedSurfaces: readonly SnowProtectedArea[] = [
  ...TABLES.map(t => ({ x: t.position[0], z: t.position[2], radius: Math.max(3, tableScale(t) * 2.5),
    topY: t.position[1] + (t.boardOffsetY ?? 0) + GOMOKU.boardY + .5 })),
  winterCookingSurface,
]
