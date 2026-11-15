import { RENEWAL_PARK_ENABLED } from '../src/park/mapSelection'

const walkEnabled = import.meta.env.DEV && RENEWAL_PARK_ENABLED
const walking = walkEnabled && new URLSearchParams(location.search).get('play') === '1'

if (walking) {
  document.body.classList.add('park-renewal-walking')
  document.title = '온탑 · 220m 공원 산책'
  const viewport = document.getElementById('park-viewport')!
  viewport.setAttribute('aria-label', '220m 공원 산책')
  const mount = document.createElement('div')
  mount.id = 'duck-boat-root'
  viewport.replaceChildren(mount)
  const { mountDuckBoatPreview } = await import('../src/features/duckBoat/preview')
  await mountDuckBoatPreview(mount, true)
} else {
  document.getElementById('park-local-walk')!.hidden = !walkEnabled
  await import('./main')
}
