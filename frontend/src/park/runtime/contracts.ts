/** FE command port, not an HTTP/WS DTO or a proposed server API.
 * UI, input and 3D picking depend on this port; read models stay in
 * network/worldClient and game/store. Spring owns the existing transport.
 */
export interface ParkRuntimePort {
  start(): void
  stop(): Promise<void>
  addAuthListener(listener: () => void): () => void
  reconnect(): void
  requestJSON(path: string, init?: RequestInit): Promise<unknown>
  checkFacilities(reloadCatalog?: boolean): Promise<void>
  useFacility(facilityId: string, seatIndex: number, signal: AbortSignal): Promise<import('../../features/facilities/protocol').FacilityLease>
  releaseFacility(leaseId: string, signal: AbortSignal): Promise<void>
  aimFacility(leaseId: string, aim: { yaw: number; pitch: number }, signal: AbortSignal): Promise<{ yaw: number; pitch: number }>
  selectChannel(channelId: string): Promise<boolean>
  sendChat(text: string): Promise<boolean>
  sendSpectatorChat(text: string): Promise<boolean>
  pingOmok(x: number, y: number): Promise<boolean>
  sendEmote(id: import('../../features/emotes/catalog').EmoteId): Promise<boolean>
  move(dx: number, dz: number, run: boolean, jump?: boolean): void
  stopMovement(): void
  inspectTable(anchorId: string): void
  closeTable(): void
  joinTable(anchorId?: string): Promise<boolean>
  leaveTable(): Promise<boolean>
  selectOmok(): Promise<boolean>
  selectGame(code: import('../../features/tableLobby/model').TableGameCode, betAmountPerPlayer: number, targetScore?: number): Promise<boolean>
  setReady(ready: boolean): Promise<boolean>
  checkStart(): Promise<boolean>
  checkRecovery(): Promise<boolean>
  checkGame(): Promise<boolean>
  checkResult(): Promise<boolean>
  forfeitGame(gameId: string, retry?: boolean): Promise<boolean>
  placeOmok(x: number, y: number): Promise<boolean>
  actDice(kind: 'roll' | 'bank', selectedIds: readonly number[]): Promise<boolean>
  actOneCard(input: import('../../game/onecard/protocol').OneCardInput): Promise<boolean>
  actBridge(input: import('../../game/bridge/protocol').BridgeInput): Promise<boolean>
  watchGame(gameId: string): Promise<boolean>
  watchBench(anchorId: string): Promise<boolean>
  unwatchGame(): Promise<boolean>
}
