import layout from './layout.json'
import staticParkUrl from './original-park.bin.gz?url'
import { restoreStaticPark, staticPark } from './static/store'

export { layout }
export type ParkView = 'overview' | 'plan'
export type Facility = (typeof layout.facilities)[number]

export async function createParkPreview(viewport: HTMLElement) {
  if (!staticPark) await restoreStaticPark(staticParkUrl)
  const { mountOriginalPark } = await import('./OriginalParkPreview')
  return mountOriginalPark(viewport)
}
