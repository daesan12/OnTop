import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../park/ParkPage'
import { avatars, useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { TABLES, GOMOKU } from '../../park/mapConfig'
import { viewControls } from '../../world/cameraPerspective'
import { cameraRelativeMove } from '../../network/movementInput'
import { exchangeCallbackCode, getAuthSession } from '../../auth/authFlow'
import { parkRuntime } from '../../park/runtime/runtime'
import '../../styles.css'

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.data.root = root

/** 인증·입장 이후 착석/설정/준비/시작은 공원의 기존 Runtime과 서버 명령을 사용한다. */
function LocalChannelEntry() {
  const attempted = useRef(false)
  const room = useSession(state => state.roomId)
  const ready = useSession(state => state.status === 'connected' && !state.pending
    && state.mapContractStatus === 'verified' && state.channels.some(channel => channel.channelId === 'channel-1'))
  useEffect(() => {
    if (attempted.current || room || !ready) return
    attempted.current = true
    void parkRuntime.selectChannel('channel-1')
  }, [room, ready])
  return null
}

function LocalPreviewBadge({ role }: { role: string }) {
  const playing = useGame(state => !!state.game?.davinci)
  if (playing) return null
  return <nav style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 65, background: '#fff8df', padding: 8, borderRadius: 8 }} aria-label="로컬 흑백수사 검수">
    <strong>로컬 검수 · 실제 회원/재화 없음</strong> · 참가자 {role}
    {Array.from({ length: 4 }, (_, index) => <a key={index} href={`?role=${index + 1}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>{index + 1}</a>)}
  </nav>
}

async function boot() {
  if (!import.meta.env.DEV
    || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 검수 전용 화면입니다.')
  const requested = new URLSearchParams(location.search).get('role') ?? '1'
  const role = /^(?:[1-4]|viewer)$/.test(requested) ? requested : '1'
  if (getAuthSession()?.status !== 'AUTHENTICATED') {
    const response = await fetch('/api/v1/dev/davinci/session', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('로컬 공원 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
    await exchangeCallbackCode()
  }
  // DEV 엔트리의 읽기/기존 명령 검수 포트. 인증 토큰이나 좌표 변경 기능을 노출하지 않는다.
  Object.assign(window, { davinciParkTest: {
    state: () => {
      const world = useSession.getState(), game = useGame.getState()
      return { userId: world.sessionId, roomId: world.roomId, status: world.status, mapStatus: world.mapContractStatus,
        avatar: avatars.get(world.sessionId)?.current, tableId: world.tableId, table: world.tableStates[world.tableId],
        error: world.error || game.error, recovery: game.recovery, uncertain: game.uncertain,
        gameId: game.game?.gameId, game: game.game?.davinci, result: game.result ?? game.lastResult, startPhase: game.start?.phase }
    },
    tables: () => TABLES.map(table => ({ id: table.id, position: table.position, interactionPoints: table.interactionPoints })),
    interactionRadius: GOMOKU.interactionRadius,
    route: async (start: { x: number; z: number }, destination: { x: number; z: number }) =>
      (await import('../../features/navigation/parkNavigation')).findParkRoute(start, destination),
    direction: (forward: number, side: number) => cameraRelativeMove(forward, side, viewControls.yaw, true, false, { dx: 0, dz: 0, run: false, jump: false }),
  } })
  root.render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
      onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <LocalChannelEntry />
    <LocalPreviewBadge role={role} />
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
