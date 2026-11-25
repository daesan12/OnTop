import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { StoneRumbleGame } from './StoneRumbleGame'
import { StoneTowerIcon } from './StoneTowerIcon'
import { parseStoneState, stoneName, type StoneControl, type StoneState } from './protocol'
import '../../styles.css'
import { useLocalChat } from './useLocalChat'
import { useBgmTrack } from '../../audio/bgm'
import { StoneControlQueue } from './controlQueue'

const requestedRole = new URLSearchParams(location.search).get('role') ?? '1'
const role = ['1', '2', '3', '4', '5', '6', '7', '8'].includes(requestedRole) ? requestedRole : '1'
const ownId = String(Number(role) * 101)

function Preview() {
  const [state, setState] = useState<StoneState | null>(null), [connected, setConnected] = useState(false)
  useBgmTrack(state?.status === 'PLAYING' ? null : 'lobby')
  const [notice, setNotice] = useState('다른 참가자의 화면을 연 뒤 시작해 주세요.'), [players, setPlayers] = useState(8)
  const [restored, setRestored] = useState(false)
  const [parkReady, setParkReady] = useState(false)
  const [preparation, setPreparation] = useState<StoneState | null>(null), [readyRoles, setReadyRoles] = useState<number[]>([])
  const [preparationError, setPreparationError] = useState(''), [preparationAttempt, setPreparationAttempt] = useState(0)
  const [busy, setBusy] = useState(false), [reconnect, setReconnect] = useState(0)
  const [exited, setExited] = useState(false)
  const exit = useCallback(() => { setExited(true); setState(null); setConnected(false); setRestored(false) }, [])
  const socket = useRef<WebSocket | null>(null), version = useRef(0), gameId = useRef('')
  const controlAck = useRef<{ id: string; resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> } | null>(null)
  const allowed = useRef(false)
  allowed.current = connected && restored && state?.status === 'PLAYING' && state.phase !== 'LOADING' && !!state.players.find(p => p.userId === ownId)?.alive
  const controls = useRef<StoneControlQueue | null>(null)
  controls.current ??= new StoneControlQueue((scope, input) => {
    if (!allowed.current || scope !== gameId.current || socket.current?.readyState !== WebSocket.OPEN) return Promise.resolve(false)
    return new Promise<boolean>(resolve => {
      const id = crypto.randomUUID(), timer = setTimeout(() => { controlAck.current = null; resolve(false) }, 8000)
      controlAck.current = { id, resolve, timer }
      socket.current!.send(JSON.stringify({ type: 'GAME_ACTION_SEND', requestId: id, payload: { gameId: scope, actionId: crypto.randomUUID(), expectedVersion: version.current, input } }))
    })
  })
  useEffect(() => { if (!allowed.current) controls.current!.reset() }, [connected, restored, state?.gameId, state?.status, state?.phase, state?.players.find(p => p.userId === ownId)?.alive])
  const clientId = useRef(crypto.randomUUID()), startRequest = useRef<string | null>(null)
  const readinessRevision = useRef(0)
  const chat = useLocalChat(state?.gameId ?? '', role, clientId.current, connected && !exited, state?.status === 'PLAYING')
  const sceneStatus = useCallback((ready: boolean, error?: string) => { setParkReady(ready); setPreparationError(error ?? '') }, [])
  useEffect(() => {
    let cancelled = false
    const report = () => fetch(`/dev/stone-rumble/readiness?${new URLSearchParams({ role, clientId: clientId.current, ready: String(parkReady), connected: 'true', revision: String(++readinessRevision.current) })}`,
      { method: 'POST', headers: { 'X-Stone-Rumble-Demo': 'local' } })
    const heartbeat = () => {
      void report().then(response => {
        if (!response.ok) throw new Error('준비 상태를 전달하지 못했어요.')
        return response.json()
      }).then(config => { if (!cancelled) setReadyRoles(config.readyRoles ?? []) })
        .catch(() => { if (!cancelled) { setReadyRoles([]); setNotice('서버의 준비 상태를 확인하고 있어요.') } })
    }
    if (!connected) return
    heartbeat()
    const timer = setInterval(heartbeat, 1500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [connected, parkReady])
  useEffect(() => {
    const release = () => {
      const query = new URLSearchParams({ role, clientId: clientId.current, ready: 'false', connected: 'false', revision: String(++readinessRevision.current) })
      void fetch(`/dev/stone-rumble/readiness?${query}`, { method: 'POST', headers: { 'X-Stone-Rumble-Demo': 'local' }, keepalive: true }).catch(() => {})
    }
    if (!connected) { release(); return }
    window.addEventListener('pagehide', release)
    return () => { window.removeEventListener('pagehide', release); release() }
  }, [connected])
  const sendMessage = useCallback((type: string, payload: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type, requestId: crypto.randomUUID(), payload }))
  }, [])
  useEffect(() => {
    if (exited) return
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      let subscribed = ''
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/tables?testRole=${role}`)
      socket.current = ws
      ws.onmessage = event => {
        if (cancelled) return
        try {
          const message = JSON.parse(event.data), payload = message.payload
          const ack = controlAck.current
          if (ack && message.requestId === ack.id && ['GAME_ACTION_RESULT', 'ERROR'].includes(message.type)) {
            clearTimeout(ack.timer); controlAck.current = null; ack.resolve(message.type === 'GAME_ACTION_RESULT')
          }
          if (message.type === 'CONNECTED') setConnected(true)
          if (message.type === 'GAME_CONNECTION_STATE') {
            setRestored(payload.status === 'RESTORED')
            if (payload.state?.publicState?.gameCode === 'STONE_RUMBLE') {
              const recovered = parseStoneState(payload.state.publicState)
              version.current = payload.version; gameId.current = recovered.gameId; setState(recovered)
            }
            if (payload.status === 'RESTORED' && payload.gameId && subscribed !== payload.gameId) {
              subscribed = payload.gameId
              gameId.current = payload.gameId
              sendMessage('GAME_STATE_CHECK', { gameId: payload.gameId })
            }
          }
          if (message.type === 'GAME_STATE') {
            const parsed = parseStoneState(payload.publicState)
            if (parsed.gameId === gameId.current && payload.version < version.current) return
            version.current = payload.version; gameId.current = parsed.gameId; setState(parsed)
          }
          if (message.type === 'ERROR' && !['GAME_STATE_PENDING', 'GAME_ACTION_STALE_VERSION', 'GAME_ACTION_NOT_ACTIVE', 'GAME_ACTION_GAME_FINISHED', 'GAME_RECOVERY_REQUIRED'].includes(payload.code)) setNotice(payload.message ?? '경기 상태를 다시 확인해 주세요.')
        } catch (error) { setNotice(error instanceof Error ? error.message : '서버 응답을 읽지 못했어요.') }
      }
      ws.onclose = event => {
        controls.current!.reset()
        const ack = controlAck.current
        if (ack) { clearTimeout(ack.timer); controlAck.current = null; ack.resolve(false) }
        if (cancelled) return
        setConnected(false); setRestored(false)
        setNotice(event.code === 1008 ? '같은 참가자의 화면이 열려 있어요. 다른 참가자를 선택하거나 기존 화면을 닫아 주세요.' : '연결이 끊겼어요. 다시 연결하고 있어요.')
        if (event.code !== 1008) timer = setTimeout(connect, 1500)
      }
    }
    connect()
    const refreshConfig = () => {
      void fetch('/dev/stone-rumble/config').then(response => response.json()).then(config => {
        if (cancelled) return
        if (config.preparationState) setPreparation(previous => previous ?? parseStoneState(config.preparationState))
        setReadyRoles(config.readyRoles ?? [])
        if (!cancelled && config.publicState?.status === 'FINISHED' && config.gameId === gameId.current) {
          setState(parseStoneState(config.publicState))
        }
        if (config.publicState?.status === 'FINISHED') return
        if (!cancelled && config.gameId && config.gameId !== gameId.current && socket.current?.readyState === WebSocket.OPEN) {
          gameId.current = config.gameId; version.current = 0; setRestored(false); sendMessage('GAME_RECONNECT_CHECK', {})
        }
      }).catch(() => { if (!cancelled) setNotice('로컬 서버 연결을 확인해 주세요.') })
    }
    refreshConfig()
    const refresh = setInterval(refreshConfig, 1000)
    return () => {
      cancelled = true; clearTimeout(timer); clearInterval(refresh); controls.current!.reset()
      const ack = controlAck.current
      if (ack) { clearTimeout(ack.timer); controlAck.current = null; ack.resolve(false) }
      socket.current?.close(); socket.current = null
    }
  }, [exited, reconnect, sendMessage])
  const start = async () => {
    if (busy || !parkReady || !connected) return
    setBusy(true)
    try {
      startRequest.current ??= crypto.randomUUID()
      const query = new URLSearchParams({ players: String(state?.players.length ?? players), requestId: startRequest.current, clientId: clientId.current })
      const response = await fetch(`/dev/stone-rumble/matches?${query}`, { method: 'POST', headers: { 'X-Stone-Rumble-Demo': 'local' } })
      if (!response.ok) {
        startRequest.current = null
        throw new Error(response.status === 412 ? '모든 참가자의 공원 준비가 끝나야 시작할 수 있어요.' : response.status === 409 ? '현재 경기가 끝난 뒤 새 경기를 시작해 주세요.' : '경기를 시작하지 못했어요.')
      }
      const config = await response.json()
      startRequest.current = null
      gameId.current = config.gameId; version.current = 0; setRestored(false); setState(parseStoneState(config.publicState))
      sendMessage('GAME_RECONNECT_CHECK', {})
    } catch (error) { setNotice(error instanceof Error ? error.message : '시작 요청을 확인해 주세요.') }
    finally { setBusy(false) }
  }
  const control = useCallback((input: StoneControl, clearQueuedActions?: boolean) => {
    if (!allowed.current) { controls.current!.reset(); return }
    void controls.current!.send(gameId.current, input, clearQueuedActions)
  }, [])
  const leave = () => sendMessage('GAME_FORFEIT', { gameId: gameId.current, actionId: crypto.randomUUID() })
  const count = state?.players.length ?? players
  const readyCount = Array.from({ length: count }, (_, i) => i + 1).filter(id => readyRoles.includes(id)).length
  const allReady = parkReady && connected && readyCount === count
  return <>
  {(state || preparation) && <StoneRumbleGame state={state ?? preparation!} preparing={!state} onSceneStatus={sceneStatus} preparationAttempt={preparationAttempt}
    ownId={ownId} connected={connected} inputReady={restored} send={control} leave={leave} exit={exit} localOnly chat={chat}>
    {role === '1' ? <button className="paper-primary" disabled={busy || !allReady} onClick={() => void start()}>같은 인원으로 다시 시작</button> : <p>솔이가 다음 경기를 열 때까지 기다려 주세요.</p>}
    <p>공원 준비 완료 {readyCount} / {count}명</p>
    <p><a href="/stone-rumble.html">참가자 선택으로 돌아가기</a></p>
  </StoneRumbleGame>}
  {!state && <main className="stone-rumble-lobby" data-ready={parkReady}>
    <section className="stone-rumble-sheet"><h1><StoneTowerIcon />{exited ? '경기에서 나왔어요' : '돌탑 생존전'}</h1><p>{exited ? '남은 플레이어의 경기는 계속돼요.' : <>여덟 층의 사라지는 발판.<br />비둘기로 밀어내고, 끝까지 살아남아요.</>}</p>
      <p>육각형 발판은 밟은 뒤 1초 후 무너져요. 시작 발판 아래 8개 층에서 진행하며 1층 아래로 떨어지면 탈락해요. 참가 인원은 2~8명이에요.</p>
      <p><b>현재 참가자: {stoneName(ownId)}</b> · {connected ? '서버 연결됨' : exited ? '연결 종료' : '연결 대기'}</p>
      <div className="stone-rumble-role-list">{[1, 2, 3, 4, 5, 6, 7, 8].map(index => <a key={index} href={`?role=${index}`} target={index === Number(role) ? undefined : '_blank'} rel="noreferrer">{stoneName(String(index * 101))}{index === Number(role) ? ' (나)' : ' 화면 열기'}</a>)}</div>
      <p role="status">{preparationError || (!parkReady ? '공원과 경기장을 준비하고 있어요…' : `공원 준비 완료 ${readyCount} / ${count}명`)}</p>
      {preparationError && <button onClick={() => preparationError.startsWith('공원 파일') ? location.reload() : setPreparationAttempt(v => v + 1)}>다시 준비하기</button>}
      {exited ? <button onClick={() => setExited(false)}>로컬 대기실로 돌아가기</button> : role === '1' ? <><label>참가 인원 <select aria-label="참가 인원" value={players} onChange={e => setPlayers(Number(e.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count}명</option>)}</select></label><button disabled={!allReady || busy} onClick={() => void start()}>{!parkReady ? '공원을 준비하는 중…' : busy ? '경기를 여는 중…' : '함께 시작하기'}</button></> : <p>모든 참가자의 공원이 준비되면 솔이 화면에서 시작할 수 있어요. 선택한 인원 순서대로 참가해요.</p>}
      {!exited && <p role="status">{notice}</p>}{!connected && !exited && <button onClick={() => setReconnect(v => v + 1)}>다시 연결</button>}
      <p><small>로컬 멀티플레이 · 실제 게임 서버 판정 · 테스트 계정 사용 · DB·엽전 정산 없음</small></p>
    </section>
  </main>}
  </>
}
createRoot(document.getElementById('root')!).render(<Preview />)
