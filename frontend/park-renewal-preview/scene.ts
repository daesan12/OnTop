import layout from './layout.json'
import staticParkUrl from './original-park.bin.gz?url'
import { loadStaticPark } from './static/load'

export { layout }
export type ParkView = 'overview' | 'plan'
export type Facility = (typeof layout.facilities)[number]

export async function createParkPreview(viewport: HTMLElement) {
  await loadStaticPark(staticParkUrl)
  const { mountOriginalPark } = await import('./OriginalParkPreview')
  return mountOriginalPark(viewport)
}
