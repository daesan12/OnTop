import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../park/ParkPage'
import { exchangeCallbackCode } from '../../auth/authFlow'
import { useSession } from '../../network/worldClient'
import { avatars } from '../../network/worldClient'
import { useGame } from '../store'
import { parkRuntime } from '../../park/runtime/runtime'
import { usePreparationPort, preparationContext } from '../../features/tableLobby/tabletModel'
import '../../styles.css'

function LocalChannelEntry() {
  const attempted = useRef(false)
  const channel = useSession(s => s.roomId), channels = useSession(s => s.channels)
  const ready = useSession(s => s.status === 'connected' && !s.pending && s.mapCompatible)
  useEffect(() => {
    if (attempted.current || channel || !ready || !channels.length) return
    attempted.current = true
    void parkRuntime.selectChannel(channels[0]!.channelId)
  }, [channel, ready, channels])
  return null
}

/** 테스트 전용 진입점. 토큰은 메모리에만 보관하며 URL·개발 테스트 객체에 노출하지 않는다. */
async function boot() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 검수 전용 화면입니다.')
  const account = Number(new URLSearchParams(location.search).get('account') ?? 101)
  if (![101, 202, 303, 404, 505, 606, 707, 808].includes(account)) throw new Error('테스트 계정을 확인해주세요.')
  const response = await fetch('/api/v1/local/bang/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account }) })
  if (!response.ok) throw new Error('로컬 뱅 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  history.replaceState(null, '', location.pathname + location.search)
  Object.assign(window, { bangParkTest: {
    state: () => {
      const s = useSession.getState(), g = useGame.getState()
      return { userId: s.sessionId, status: s.status, roomId: s.roomId, tableId: s.tableId, bindings: s.bindings, mapCompatible: s.mapCompatible,
        x: avatars.get(s.sessionId)?.current.x, z: avatars.get(s.sessionId)?.current.z, tables: s.tables, table: s.tableStates[s.tableId],
        phase: g.start?.phase, recovery: g.recovery, publicState: g.game?.bang, privateState: g.game?.bangHand, error: g.error, sessionError: s.error }
    },
    join: (anchorId: string) => parkRuntime.joinTable(anchorId),
    inspect: (anchorId: string) => parkRuntime.inspectTable(anchorId),
    ready: () => parkRuntime.setReady(true),
    configure: (count: number) => {
      const s = useSession.getState(), table = s.tableStates[s.tableId], port = usePreparationPort.getState().port
      if (!table || !port) throw new Error('테이블에 먼저 앉아주세요.')
      return port.configure(preparationContext(table), { gameCode: 'BANG', playerCount: count, betAmountPerPlayer: 0 })
    },
    start: () => {
      const s = useSession.getState(), table = s.tableStates[s.tableId], port = usePreparationPort.getState().port
      if (!table || !port) throw new Error('테이블 준비 상태를 확인해주세요.')
      return port.start(preparationContext(table))
    },
    act: (action: import('./protocol').BangAction) => parkRuntime.actBang?.(action),
    chat: (text: string) => parkRuntime.sendSpectatorChat(text),
    forfeit: () => parkRuntime.forfeitGame(useGame.getState().game!.gameId),
    leave: () => parkRuntime.leaveTable(),
    channel: (id: string) => parkRuntime.selectChannel(id),
    watch: (id: string) => parkRuntime.watchGame(id),
    move: (x: number, z: number) => parkRuntime.move(x, z, false),
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError="" onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <LocalChannelEntry />
    <aside style={{ position: 'fixed', bottom: 6, left: 8, zIndex: 43, font: '12px sans-serif', background: '#f7e7c9', color: '#302314', padding: 6, borderRadius: 5 }}>
      테스트 계정 {account / 101} · 인증/지갑은 메모리 fixture · 공원/게임/소켓은 실제 로컬 서버
    </aside>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = error instanceof Error ? error.message : String(error) })
