import { preloadAuthSession } from './auth/authFlow'
import { RENEWAL_PARK_ENABLED } from './park/mapSelection'
import { loadRenewalParkWorld } from './park/loadRenewalParkWorld'

// Start the existing single-flight refresh before downloading/evaluating React
// and Three. OAuth callback exchange owns its own credentials and must not race
// a refresh of the previous session. App reuses this same in-memory request.
const path = window.location.pathname
if (path !== '/auth/callback') preloadAuthSession()
if (RENEWAL_PARK_ENABLED && (path === '/auth/callback' || path === '/park')) {
  // The map contract and the scene archive can load alongside the app.
  void import('./park/renewalMap').catch(() => {})
  void loadRenewalParkWorld().catch(() => {})
  void import('./network/predictionEngine').then(({ preparePredictionEngine }) => preparePredictionEngine()).catch(() => {})
  void import('./world/worldAssets').then(({ preloadWorldAssets }) => preloadWorldAssets()).catch(() => {})
  // Fetch the canvas while the park scene reads the terrain.
  void import('./park/loadWorldCanvas').then(({ preloadWorldCanvas }) => preloadWorldCanvas()).catch(() => {})
}
void import('./main')
