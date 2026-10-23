/** FE command port, not an HTTP/WS DTO or a proposed server API.
 * UI, input and 3D picking depend on this port; read models stay in
 * network/worldClient and game/store. Spring owns the existing transport.
 */
export interface ParkRuntimePort {
  start(): void
  stop(): Promise<void>
  addAuthListener(listener: () => void): () => void
  reconnect(): void
  selectChannel(channelId: string): Promise<boolean>
  sendChat(text: string): Promise<boolean>
  sendEmote(id: import('../../features/emotes/catalog').EmoteId): Promise<boolean>
  move(dx: number, dz: number, run: boolean, jump?: boolean): void
  inspectTable(anchorId: string): void
  closeTable(): void
  joinTable(): Promise<boolean>
  leaveTable(): Promise<boolean>
  selectOmok(): Promise<boolean>
  setReady(ready: boolean): Promise<boolean>
  checkStart(): Promise<boolean>
  checkRecovery(): Promise<boolean>
  checkGame(): Promise<boolean>
  checkResult(): Promise<boolean>
  placeOmok(x: number, y: number): Promise<boolean>
  watchGame(gameId: string): Promise<boolean>
  unwatchGame(): Promise<boolean>
}
