/** A table's lobby, game and spectator view all keep their own unobstructed presentation. */
export function winterBoardViewActive(
  session: { tableId: string; focusedAnchorId: string },
  game: { game: unknown; watchedGameId: string },
  lobby: { joiningAnchorId: string; spectatorRequested: boolean },
) {
  return !!(session.tableId || session.focusedAnchorId || game.game || game.watchedGameId
    || lobby.joiningAnchorId || lobby.spectatorRequested)
}
