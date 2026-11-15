let preparedDialog: typeof import('./JumpRopeDialog').default | undefined
let pending: Promise<typeof import('./JumpRopeDialog')> | undefined

export const getPreparedJumpRopeDialog = () => preparedDialog

export function loadJumpRopeDialog() {
  return pending ??= import('./JumpRopeDialog').then(module => {
    preparedDialog = module.default
    return module
  }).catch(error => {
    pending = undefined
    throw error
  })
}

export function preloadJumpRopeView() {
  void loadJumpRopeDialog().catch(() => {
    // Opening the game still tries to load the dialog if preloading failed.
  })
}
