import { exchangeCallbackCode, preloadAuthSession } from './auth/authFlow'
import { RENEWAL_PARK_ENABLED } from './park/mapSelection'
import { loadRenewalParkWorld } from './park/loadRenewalParkWorld'
import { requestRenewalMap } from './park/renewalMapRequest'
import { sceneUrl } from 'virtual:park-geometry'

// Start the existing single-flight refresh before downloading/evaluating React
// and Three. OAuth callback exchange owns its own credentials and must not race
// a refresh of the previous session. App reuses this same in-memory request.
const path = window.location.pathname
if (path === '/auth/callback') {
  // The callback page reuses this exchange after the UI modules finish loading.
  void exchangeCallbackCode().catch(() => {})
} else preloadAuthSession()
if (RENEWAL_PARK_ENABLED && (path === '/auth/callback' || path === '/park')) {
  // The map contract and the scene archive can load alongside the app.
  void requestRenewalMap().catch(() => {})
  void loadRenewalParkWorld().catch(() => {})
  // Fetch the movement module too so the first accepted server pose can
  // initialize local collision without another module request.
  void import('./network/predictionPhysics').catch(() => {})
  void import('./network/predictionEngine').then(({ preparePredictionEngine }) => preparePredictionEngine()).catch(() => {})
  void import('./world/worldAssets').then(({ preloadWorldAssets }) => preloadWorldAssets()).catch(() => {})
  // Start fetching the emitted canvas before its shared dependencies finish evaluating.
  if (sceneUrl) {
    const preload = document.createElement('link')
    preload.rel = 'modulepreload'
    preload.href = sceneUrl
    document.head.append(preload)
  }
  void import('./park/loadWorldCanvas').then(({ preloadWorldCanvas }) => preloadWorldCanvas()).catch(() => {})
}
void import('./main')
