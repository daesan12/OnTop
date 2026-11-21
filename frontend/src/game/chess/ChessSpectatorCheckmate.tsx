import { useEffect, useState } from 'react'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput } from '../../world/inputOwnership'
import { useGame } from '../store'
import { ChessCheckmateHero } from './ChessCheckmateHero'
import { observeSpectatorCheckmate, type SpectatorCheckmate } from './checkmate'

export function ChessSpectatorCheckmate() {
  const [victory, setVictory] = useState<SpectatorCheckmate | null>(null)
  const own = useSession(s => s.sessionId), room = useSession(s => s.roomId), table = useSession(s => s.tableId)
  const connected = useSession(s => s.status === 'connected'), watched = useGame(s => s.watchedGameId)
  const profile = useSession(s => s.profiles[victory?.winnerId ?? '']), runtime = useParkRuntime()
  useEffect(() => {
    setVictory(null)
    if (!own || !room || table) return
    return observeSpectatorCheckmate(setVictory)
  }, [own, room, table])
  useEffect(() => { if (victory) clearRoamingInput() }, [victory])
  useEffect(() => { if (victory && watched && watched !== victory.gameId) setVictory(null) }, [victory, watched])
  // A new match, seat, channel or login must never inherit the previous observer's celebration.
  if (!victory || !connected || table || watched && watched !== victory.gameId) return null
  const close = () => {
    if (useGame.getState().watchedGameId === victory.gameId) void runtime.unwatchGame()
    setVictory(null)
  }
  return <PaperPopup title="체스 · 관전 경기 종료" label="체스 체크메이트 결과" className="chess-checkmate-dialog" onClose={close}>
    <ChessCheckmateHero key={victory.gameId} winnerName={`${victory.side} · ${profile?.nickname ?? '참가자'}`} />
    <button onClick={close}>관전 결과 닫기</button>
  </PaperPopup>
}
