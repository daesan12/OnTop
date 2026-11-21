/** FE command port, not an HTTP/WS DTO or a proposed server API.
 * UI, input and 3D picking depend on this port; read models stay in
 * network/worldClient and game/store. Spring owns the existing transport.
 */
export interface ParkRuntimePort {
  cooperativeGame?: import('../../features/skewer/coop/contracts').CoopTransport
  start(): void
  stop(): Promise<void>
  addAuthListener(listener: () => void): () => void
  subscribeNotesChanged(changed: () => void): () => void
  reconnect(): void
  requestJSON(path: string, init?: RequestInit): Promise<unknown>
  startBalloon(ticketId: string, position: import('../../features/balloon/flight').Point,
    boarding: import('../../features/balloon/flight').BalloonBoarding): Promise<boolean>
  launchBalloon(ticketId: string, solo: boolean): Promise<void>
  controlBalloon(ticketId: string, action: import('../../features/balloon/controls').ControlAction): Promise<void>
  sendBalloonPose(ticketId: string, position: import('../../features/balloon/flight').Point, aboard: boolean,
    cabin: import('../../features/balloon/cabin').CabinPose, input: import('../../features/balloon/flight').Input): void
  endBalloon(ticketId: string): void
  checkFacilities(reloadCatalog?: boolean): Promise<void>
  useFacility(facilityId: string, seatIndex: number, signal: AbortSignal): Promise<import('../../features/facilities/protocol').FacilityLease>
  releaseFacility(leaseId: string, signal: AbortSignal): Promise<void>
  boatCommand?(type: import('../../network/facilityClient').BoatCommand, payload: Record<string, unknown>, signal: AbortSignal): Promise<void>
  aimFacility(leaseId: string, aim: { yaw: number; pitch: number }, signal: AbortSignal): Promise<{ yaw: number; pitch: number }>
  selectChannel(channelId: string): Promise<boolean>
  enterRecommendedChannel(): Promise<boolean>
  refreshChannels(): Promise<boolean>
  sendChat(text: string): Promise<boolean>
  sendTyping?(typing: boolean): Promise<boolean>
  setMyRoomOpen?(open: boolean): Promise<boolean>
  sendSpectatorChat(text: string): Promise<boolean>
  pingOmok(x: number, y: number): Promise<boolean>
  pingLedger(target: import('../../game/ledger/protocol').LedgerPingTarget): Promise<boolean>
  sendEmote(id: import('../../features/emotes/catalog').EmoteId): Promise<boolean>
  pickupAvatar?(targetId: string): Promise<boolean>
  pickupSnowball?(pileId: string): Promise<boolean>
  escapeSnowball?(freezeId: string, key: 'A' | 'D'): Promise<boolean>
  aimSnowball?(yaw: number): Promise<import('../../features/winter/trajectory').SnowballAim | null>
  throwSnowball?(yaw: number): Promise<boolean>
  throwAvatar?(carryId: string, direction: { dx: number; dy: number; dz: number }): Promise<boolean>
  releaseAvatar?(carryId: string): Promise<boolean>
  setInteractionBusy?(busy: boolean, confirm?: boolean, minigame?: boolean): Promise<boolean>
  move(dx: number, dz: number, run: boolean, jump?: boolean): void
  stopMovement(): void
  setSecretDoors?(open: boolean): Promise<boolean>
  useInteriorAccess?(access: string): Promise<boolean>
  rentVehicle?(target: import('../../features/mobility/state').RentalTarget, leaseId: string): Promise<void>
  endVehicleRental?(leaseId: string): Promise<void>
  inspectTable(anchorId: string, watch?: boolean): void
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
  actOmokUndo?(input: import('../../game/omok/undo').OmokUndoInput): Promise<boolean>
  actOmokDraw?(input: import('../../game/omok/draw').OmokDrawInput): Promise<boolean>
  actDice(kind: 'roll' | 'bank', selectedIds: readonly number[]): Promise<boolean>
  actOneCard(input: import('../../game/onecard/protocol').OneCardInput): Promise<boolean>
  flipOneCardHand?(targetUserId: string, cardIndex?: number, handVersion?: number): Promise<boolean>
  restoreOneCardHand?(): Promise<boolean>
  hitOneCardHand?(attemptId: string): Promise<boolean>
  sendAlkkagiSpectator?(input: Record<string, unknown>): Promise<boolean>
  actStoneRumble?(input: import('../../game/stone-rumble/protocol').StoneAction, clearQueuedActions?: boolean): Promise<boolean>
  actQuoridor?(input: import('../../game/quoridor/protocol').QuoridorInput): Promise<boolean>
  actAlkkagi?(input: Record<string, unknown>): Promise<boolean>
  actBridge(input: import('../../game/bridge/protocol').BridgeInput): Promise<boolean>
  actLedger(input: import('../../game/ledger/protocol').LedgerInput): Promise<boolean>
  flipHalli(): Promise<boolean>
  /** bellWindowId and expectedVersion come from the state the player saw when pressing the bell. */
  ringHalli(bellWindowId: number, expectedVersion: number): Promise<boolean>
  watchGame(gameId: string): Promise<boolean>
  watchBench(anchorId: string, observeOnly?: boolean): Promise<boolean>
  unwatchGame(): Promise<boolean>
}
