import { create } from 'zustand'
import { lookScale } from '../../world/lookSensitivity'

/** Presentation only; these fields never confer a seat, game grant or result. */
const initial = () => ({
  epoch: 0, tableId: '', requestId: '', status: 'idle' as 'idle' | 'loading' | 'ready' | 'error', error: '',
  spectatorView: 'board' as 'board' | 'table', lookScope: '',
  panelOpen: false, spectatorRequested: false,
  spectatorStatus: 'idle' as 'idle' | 'waiting' | 'starting' | 'watching' | 'switching' | 'error', spectatorError: '',
})
export const useTableLobby = create(initial)
export const seatedLook = { yaw: 0 }
export function resetTableLobby() {
  seatedLook.yaw = 0
  useTableLobby.setState({ ...initial(), epoch: useTableLobby.getState().epoch + 1 }, true)
}
export function resetSeatedLook() {
  seatedLook.yaw = 0
  if (useTableLobby.getState().lookScope) useTableLobby.setState({ lookScope: '' })
}
export function turnSeatedLook(scope: string, movementX: number) {
  if (!scope || !Number.isFinite(movementX)) return
  if (useTableLobby.getState().lookScope !== scope) {
    seatedLook.yaw = 0
    useTableLobby.setState({ lookScope: scope })
  }
  seatedLook.yaw = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48,
    seatedLook.yaw - movementX * 0.004 * lookScale()))
}
export const seatScope = (s: { sessionId: string; tableId: string; seatIndex: number }) =>
  s.tableId && s.seatIndex >= 0 ? `${s.sessionId}/${s.tableId}/${s.seatIndex}` : ''
