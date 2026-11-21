import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../../park/ParkPage'
import { exchangeCallbackCode } from '../../../auth/authFlow'
import { parkRuntime } from '../../../park/runtime/runtime'
import { authoritativePose, useSession } from '../../../network/worldClient'
import { useGame } from '../../store'
import { Vector3 } from 'three'
import { TABLES, tableScale } from '../../../park/mapConfig'
import { chessCamera, CHESS_BOARD_SCALE, CHESS_BOARD_Y } from '../camera'
import '../../../styles.css'

function LocalEntry() {
  const attempted = useRef(false)
  const room = useSession(s => s.roomId)
  const ready = useSession(s => s.status === 'connected' && !s.pending && s.mapCompatible && s.channels.some(c => c.channelId === 'channel-1'))
  useEffect(() => {
    if (attempted.current || room === 'channel-1' || !ready) return
    attempted.current = true
    void parkRuntime.selectChannel('channel-1')
  }, [room, ready])
  return null
}

async function boot() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 체스 검수 전용입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'white'
  const response = await fetch('/api/v1/dev/chess/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('체스 로컬 검수 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  Object.assign(window, { chessParkTest: {
    state: () => { const w = useSession.getState(), g = useGame.getState(); return { status: w.status, roomId: w.roomId,
      userId: w.sessionId, tableId: w.tableId, position: authoritativePose(w.sessionId), mapCompatible: w.mapCompatible,
      gameId: g.game?.gameId, chess: g.game?.chess, tables: w.tableStates, table: w.tableStates[w.tableId],
      phase: g.start?.phase, recovery: g.recovery, error: g.error, sessionError: w.error, result: g.result,
      cameraReady: chessCamera.ready, cameraAnchor: chessCamera.anchorId } },
    projectSquare: (square: string) => {
      const camera = chessCamera.current, anchor = TABLES.find(t => t.id === chessCamera.anchorId)
      const rect = document.querySelector('canvas')?.getBoundingClientRect(), board = useGame.getState().game?.chess?.board
      if (!camera || !anchor || !rect || !board || !/^[a-h][1-8]$/.test(square)) return null
      const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1, piece = board[rank * 8 + file]
      const top = piece === '.' ? .09 : ({ P: .74, N: 1.02, B: 1.05, R: .86, Q: 1.15, K: 1.12 }[piece.toUpperCase()] ?? .09)
      const scale = CHESS_BOARD_SCALE * tableScale(anchor)
      const point = new Vector3(anchor.position[0] + (file - 3.5) * scale,
        anchor.position[1] + (anchor.boardOffsetY ?? 0) + CHESS_BOARD_Y + (.051 + top) * CHESS_BOARD_SCALE,
        anchor.position[2] + (3.5 - rank) * scale).project(camera)
      return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height }
    },
    runtime: parkRuntime,
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError="" onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <LocalEntry />
    <nav aria-label="체스 로컬 검수" style={{ position: 'fixed', bottom: 4, right: 6, zIndex: 59, background: '#fff8df', padding: '5px 9px', borderRadius: 8, fontSize: 12 }}>
      로컬 체스 · 계정·정산은 메모리 대역 · {role === 'white' ? '백 계정' : role === 'black' ? '흑 계정' : '관전 계정'}
    </nav>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
