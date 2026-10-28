/** Normal development and production use the tablet on seating. Isolated asset previews
 * keep their existing UI; an explicit false retains AUTO-server compatibility. */
const isolatedPreview = ['facility-preview', 'bungeoppang-preview'].includes(import.meta.env.MODE)
export const TABLET_ENABLED = import.meta.env.VITE_TABLET_LOBBY === 'true'
  || import.meta.env.VITE_TABLET_LOBBY !== 'false' && !isolatedPreview
