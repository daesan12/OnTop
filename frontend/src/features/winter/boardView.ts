/** Table and private cooking views keep their own unobstructed presentation. */
export function winterBoardViewActive(
  session: { tableId: string; focusedAnchorId: string },
  game: { game: unknown; watchedGameId: string },
  lobby: { joiningAnchorId: string; spectatorRequested: boolean },
  cooking = false,
) {
  return !!(session.tableId || session.focusedAnchorId || game.game || game.watchedGameId
    || lobby.joiningAnchorId || lobby.spectatorRequested || cooking)
}
