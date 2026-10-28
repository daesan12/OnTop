import type { TableAnchor } from '../../config'
/** The rendered scene owns visual coordinates. This also supports a generated map
 * without copying its placement or introducing a second source of coordinates. */
export const renderedTableAnchors = new Map<string, TableAnchor>()
