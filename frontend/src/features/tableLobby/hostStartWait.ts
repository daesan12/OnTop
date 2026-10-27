import { create } from 'zustand'
import type { TableState } from '../../network/protocol'

export const HOST_START_WAIT_SECONDS = 120
export interface HostWaitScope { userId: string; channelId: string; tableId: string }
/** FE adapter input, not a proposed wire message. Times are server Unix milliseconds. */
export interface HostWaitSnapshot {
  revision: number; tableVersion: number; hostUserId: string | null
  serverNow: number; expiresAt: number | null
}
export interface HostTimeoutReceipt {
  eventId: string; revision: number; tableVersion: number
  previousHostUserId: string; nextHostUserId: string | null
}
interface HostWaitState {
  token: object | null; scope: HostWaitScope | null
  snapshot: (HostWaitSnapshot & { observedAt: number }) | null
  receipt: HostTimeoutReceipt | null; dismissedEventId: string
}
const initial = (): HostWaitState => ({ token: null, scope: null, snapshot: null, receipt: null, dismissedEventId: '' })
export const useHostStartWait = create(initial)
export function resetHostStartWait() { useHostStartWait.setState(initial(), true) }
const version = (n: number) => Number.isSafeInteger(n) && n >= 0
const identifier = (s: string) => typeof s === 'string' && !!s.trim() && s.length <= 120

/** Bind per authenticated table visit; dispose/rebind on disconnect or scope change.
 * The server adapter supplies these snapshots. No local kick or host selection exists. */
export function bindHostStartWait(scope: HostWaitScope) {
  if (![scope.userId, scope.channelId, scope.tableId].every(identifier)) throw new Error('잘못된 테이블 대기 범위입니다.')
  const token = {}
  useHostStartWait.setState({ ...initial(), token, scope: { ...scope } }, true)
  return {
    update(snapshot: HostWaitSnapshot) {
      const current = useHostStartWait.getState()
      if (current.token !== token || !version(snapshot.revision) || !version(snapshot.tableVersion)
        || !(identifier(snapshot.hostUserId!) || snapshot.hostUserId === null && snapshot.expiresAt === null) || !version(snapshot.serverNow)
        || (snapshot.expiresAt !== null && !version(snapshot.expiresAt))
        || (current.receipt && snapshot.revision < current.receipt.revision)
        || (current.snapshot && (snapshot.revision < current.snapshot.revision || snapshot.tableVersion < current.snapshot.tableVersion
          || snapshot.revision === current.snapshot.revision && (snapshot.hostUserId !== current.snapshot.hostUserId
            || snapshot.expiresAt !== current.snapshot.expiresAt || snapshot.serverNow < current.snapshot.serverNow
            || snapshot.tableVersion === current.snapshot.tableVersion && snapshot.serverNow === current.snapshot.serverNow)))) return false
      useHostStartWait.setState({ snapshot: { ...snapshot, observedAt: performance.now() } })
      return true
    },
    timeout(receipt: HostTimeoutReceipt) {
      const current = useHostStartWait.getState()
      if (current.token !== token || !identifier(receipt.eventId) || !version(receipt.revision)
        || !version(receipt.tableVersion) || !identifier(receipt.previousHostUserId)
        || (current.snapshot && receipt.revision < current.snapshot.revision)
        || (receipt.nextHostUserId !== null && (!identifier(receipt.nextHostUserId) || receipt.nextHostUserId === receipt.previousHostUserId))
        || (current.receipt && (receipt.eventId === current.receipt.eventId || receipt.revision <= current.receipt.revision))) return false
      useHostStartWait.setState({ receipt: { ...receipt } })
      return true
    },
    dispose() { if (useHostStartWait.getState().token === token) resetHostStartWait() },
  }
}
export function hostWaitSeconds(snapshot: HostWaitState['snapshot'], now = performance.now()) {
  if (!snapshot || snapshot.expiresAt === null) return null
  return Math.max(0, Math.ceil((snapshot.expiresAt - snapshot.serverNow - Math.max(0, now - snapshot.observedAt)) / 1000))
}
export function formatHostWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
export function activeHostWait(state: HostWaitState, table: TableState, userId: string, channelId: string,
  selectedCount: number | null, connected: boolean, phase: string | undefined) {
  const { scope, snapshot } = state
  if (!connected || (phase && phase !== 'WAITING') || !scope || !snapshot || snapshot.expiresAt === null
    || scope.userId !== userId || scope.channelId !== channelId || scope.tableId !== table.tableId
    || snapshot.hostUserId !== table.selectorUserId || snapshot.tableVersion !== table.version
    || !table.gameCode || !table.betAmountPerPlayer || !table.allReady
    || selectedCount === null || selectedCount < table.minimumPlayers || selectedCount > table.capacity
    || table.seats.filter(s => s.userId).length !== selectedCount
    || !table.seats.some(s => s.userId === userId) || !table.seats.filter(s => s.userId).every(s => s.ready)) return null
  return snapshot
}
