import RAPIER from '@dimforge/rapier3d-compat'

let initialization: Promise<void> | undefined

export function preparePredictionEngine() {
  return initialization ??= RAPIER.init().catch(error => {
    initialization = undefined
    throw error
  })
}
