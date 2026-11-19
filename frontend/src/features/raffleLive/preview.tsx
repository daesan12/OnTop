import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import { MockLiveServer, MOCK_ORDERS, MOCK_SCENARIOS, type MockOrder, type MockScenario } from './mock'
import type { LivePhase, LiveSnapshot } from './protocol'
import { CAMERA_VIEWS, PreviewScene, type CameraView } from './PreviewScene'
import { useRaffleLive } from './store'
import './preview.css'

type Action = 'start' | 'pause' | 'resume' | 'reveal' | 'next' | 'reset'
const ACTIONS: { id: Action; label: string; phases: LivePhase[] }[] = [
  { id: 'start', label: '시작', phases: ['READY'] },
  { id: 'pause', label: '일시정지', phases: ['SPINNING'] },
  { id: 'resume', label: '재개', phases: ['PAUSED'] },
  { id: 'reveal', label: '당첨자 발표', phases: ['SPINNING'] },
  { id: 'next', label: '다음 슬롯', phases: ['REVEALING'] },
  { id: 'reset', label: '전체 초기화', phases: ['SPINNING', 'PAUSED', 'REVEALING', 'COMPLETED'] },
]
const PHASE_LABEL: Record<LivePhase, string> = { READY: '대기', SPINNING: '회전', PAUSED: '일시정지', REVEALING: '발표', COMPLETED: '완료' }
const labelOf = (id: Action) => ACTIONS.find(a => a.id === id)!.label

function App() {
  const [scenarioId, setScenarioId] = useState<MockScenario['id']>('crowd')
  const [order, setOrder] = useState<MockOrder>('lowFirst')
  const eventId = useRef(0)
  const server = useRef<MockLiveServer | null>(null)
  const [serverPhase, setServerPhase] = useState<LivePhase>('READY')
  const [log, setLog] = useState<string[]>([])
  const [machineKey, setMachineKey] = useState(0)
  const [view, setView] = useState<{ name: CameraView; n: number }>({ name: 'front', n: 0 })
  const [auto, setAuto] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const status = useRaffleLive(s => s.status)
  const candidates = useRaffleLive(s => s.candidates)

  const deliver = useCallback((snapshot: LiveSnapshot | null, source: string) => {
    if (!snapshot) return
    const accepted = useRaffleLive.getState().accept(snapshot)
    setServerPhase(snapshot.phase)
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setLog(lines => [`${time} ${source} · v${snapshot.version} ${PHASE_LABEL[snapshot.phase]}${accepted ? '' : ' (무시)'}`, ...lines].slice(0, 7))
  }, [])

  // 시나리오·발표 순서가 바뀌면 새 행사로 다시 시작한다.
  useEffect(() => {
    const scenario = MOCK_SCENARIOS.find(s => s.id === scenarioId)!
    const mock = new MockLiveServer(scenario, ++eventId.current, Date.now, order)
    server.current = mock
    setAuto(false)
    useRaffleLive.getState().clear()
    setMachineKey(k => k + 1)
    deliver(mock.snapshot(true), 'REST 현재 상태')
  }, [scenarioId, order, deliver])

  const act = useCallback((id: Action, source = 'WS') => {
    const mock = server.current
    if (mock) deliver(mock[id](), `${source} ${labelOf(id)}`)
  }, [deliver])

  // 자동 진행: Mock 서버가 기본 연출값(약 6.5초 회전 후 공개)에 맞춰 다음 신호를 보낸다.
  useEffect(() => {
    if (!auto) return
    const timer = setInterval(() => {
      const mock = server.current
      if (!mock || mock.phase === 'PAUSED') return
      const delay = mock.autoDelay()
      if (delay === null) { setAuto(false); return }
      if (mock.elapsed() < delay) return
      act(mock.phase === 'READY' ? 'start' : mock.phase === 'SPINNING' ? 'reveal' : 'next', 'WS 자동')
    }, 100)
    return () => clearInterval(timer)
  }, [auto, act])

  // 새로고침·중간 입장 흉내: 화면 상태와 기계를 비운 뒤 REST 현재 상태 하나로 다시 그린다.
  const restore = () => {
    useRaffleLive.getState().clear()
    setMachineKey(k => k + 1)
    setRestoring(true)
    setTimeout(() => {
      if (server.current) deliver(server.current.snapshot(true), 'REST 재접속 복원')
      setRestoring(false)
    }, 600)
  }

  const slot = status?.currentSlotIndex == null ? null : status.slots[status.currentSlotIndex]
  const summary = status ? {
    version: status.version, phase: status.phase, currentSlotIndex: status.currentSlotIndex,
    spinElapsedMs: status.spinElapsedMs, revealed: status.revealed.map(r => r.nickname ?? '(없음)'),
  } : null

  return <main className="rl-preview" aria-label="공개 추첨 기계 프리뷰">
    <PreviewScene machineKey={machineKey} view={view} />
    <header className="rl-title">
      <h1>OnTop 공개 추첨 기계</h1>
      <p>독립 프리뷰 · Mock 데이터 · 공원 미연동{SIMPLE_MAP ? ' · 공원 간소화 렌더링' : ''}</p>
    </header>
    <aside className="rl-panel">
      <section>
        <h2>진행 제어 <small>관리자 Mock</small></h2>
        <p className="rl-status" role="status">
          {restoring ? '재접속 중…' : status ? <>
            <b>{PHASE_LABEL[status.phase]}</b> · v{status.version}
            {slot ? <> · 슬롯 {slot.slotIndex + 1}/{status.slots.length} ({slot.place}등)</> : null}
          </> : '연결 전'}
        </p>
        <div className="rl-buttons">
          {ACTIONS.map(a => <button key={a.id} type="button" onClick={() => act(a.id)}
            disabled={restoring || !a.phases.includes(serverPhase)} data-kind={a.id}>{a.label}</button>)}
        </div>
        <label className="rl-check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          자동 진행 (6.5초 회전 후 발표)</label>
      </section>
      <section>
        <h2>복원·시나리오</h2>
        <button type="button" className="rl-wide" onClick={restore} disabled={restoring}>상태 복원 (새로고침·중간 입장)</button>
        <label className="rl-field">응모자
          <select value={scenarioId} onChange={e => setScenarioId(e.target.value as MockScenario['id'])}>
            {MOCK_SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="rl-field">발표 순서
          <select value={order} onChange={e => setOrder(e.target.value as MockOrder)}>
            {MOCK_ORDERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </section>
      <section>
        <h2>카메라</h2>
        <div className="rl-buttons rl-views">
          {(Object.keys(CAMERA_VIEWS) as CameraView[]).map(name => <button key={name} type="button"
            aria-pressed={view.name === name} onClick={() => setView(v => ({ name, n: v.n + 1 }))}>{CAMERA_VIEWS[name].label}</button>)}
        </div>
      </section>
      <section>
        <h2>FE가 보유한 상태 <small>후보 {candidates.length}명은 연출용</small></h2>
        <pre className="rl-json">{summary ? JSON.stringify(summary, null, 1) : '-'}</pre>
        <ol className="rl-log">{log.map((line, i) => <li key={i}>{line}</li>)}</ol>
      </section>
    </aside>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
