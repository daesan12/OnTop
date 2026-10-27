let pending: Promise<typeof import('../world/WorldCanvas')> | undefined

/** Share the authentication prefetch with the scene's lazy import. */
export function loadWorldCanvas() {
  return pending ??= import('../world/WorldCanvas').catch(error => {
    pending = undefined
    throw error
  })
}

export function preloadWorldCanvas() {
  // A failed speculative request must not interrupt authentication. The scene
  // can request it again when mounted and report its own loading error.
  void loadWorldCanvas().catch(() => {})
}
