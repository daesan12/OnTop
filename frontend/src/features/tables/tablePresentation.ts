import { useSession } from '../../network/worldClient'
export function getTableCameraMode() {
  return useSession.getState().tableId ? 'seated' : 'roaming'
}
