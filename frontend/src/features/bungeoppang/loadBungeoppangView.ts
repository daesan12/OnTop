let preparedHud: typeof import('./BungeoppangHud').BungeoppangHud | undefined
export const getPreloadedBungeoppangHud = () => preparedHud
export const loadBungeoppangHud = () => import('./BungeoppangHud')
  .then(module => ({ default: preparedHud = module.BungeoppangHud }))
export const loadBungeoppangGrill = () => import('./BungeoppangGrill')
  .then(module => ({ default: module.BungeoppangGrill }))

export function preloadBungeoppangView() {
  void Promise.all([loadBungeoppangHud(), loadBungeoppangGrill()]).catch(() => {
    // The existing entry path still handles a failed chunk load.
  })
}
