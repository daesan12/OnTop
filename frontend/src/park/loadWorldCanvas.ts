import { loadParkGeometry } from './loadParkGeometry'
import { RENEWAL_GATE_STARTUP } from './mapSelection'

let pending: Promise<typeof import('../world/WorldCanvas')> | undefined

/** Share the authentication prefetch with the scene's lazy import. */
export function loadWorldCanvas() {
  // The renewal gate uses its own baked terrain and boundary. Do not wait
  // for the legacy prop archive before starting the canvas on this path.
  const load = () => import('../world/WorldCanvas')
  return pending ??= (RENEWAL_GATE_STARTUP ? load() : loadParkGeometry().then(load)).catch(error => {
    pending = undefined
    throw error
  })
}

export function preloadWorldCanvas() {
  // A failed speculative request must not interrupt authentication. The scene
  // can request it again when mounted and report its own loading error.
  void loadWorldCanvas().catch(() => {})
}
