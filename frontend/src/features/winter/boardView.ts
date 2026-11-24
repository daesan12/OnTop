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

/** 관전 벤치는 공원 안의 시점이다. 보드 장식과 달리 기존 지붕 적설을 유지한다. */
export function winterRoofSnowActive(
  session: { tableId: string; focusedAnchorId: string; benchId?: string },
  game: { game: unknown; watchedGameId: string },
  lobby: { joiningAnchorId: string; spectatorRequested: boolean },
  cooking = false,
) {
  return !cooking && (!!session.benchId || !winterBoardViewActive(session, game, lobby))
}
