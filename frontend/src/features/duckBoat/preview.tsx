import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { requestRenewalMap } from '../../park/renewalMapRequest'
import type { ParkMapData } from '../../map/park'
import type { PredictionSimulation } from '../../network/localMovementPrediction'
import { restoreStaticPark, staticPark } from '../../../park-renewal-preview/static/store'
import archive from '../../../park-renewal-preview/original-park.bin.gz?url'
import { duckBoatDock, duration, fare } from './motion'
import type { Direction, Stage } from './DuckBoatScene'
import './preview.css'

const keys = new Map<string, Direction>([
  ['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyA', 'left'], ['ArrowLeft', 'left'],
  ['KeyS', 'back'], ['ArrowDown', 'back'], ['KeyD', 'right'], ['ArrowRight', 'right'],
])
const controls = [
  ['forward', '↑', '앞으로'], ['left', '←', '왼쪽'],
  ['back', '↓', '뒤로'], ['right', '→', '오른쪽'],
] as const
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <p className="duck-boat-message" role="alert">3D 호수를 열지 못했어요. WebGL 2 설정을 확인해 주세요.</p>
      : this.props.children
  }
}

function DuckBoatPreview({ Scene, dock, walker }: {
  Scene: typeof import('./DuckBoatScene').DuckBoatScene
  dock: ReturnType<typeof duckBoatDock>
  walker?: PredictionSimulation
}) {
  const [stage, setStage] = useState<Stage>('walk')
  const [ready, setReady] = useState(false)
  const [near, setNear] = useState(false)
  const [balance, setBalance] = useState(120)
  const [endsAt, setEndsAt] = useState(0)
  const [seconds, setSeconds] = useState(duration / 1000)
  const held = useRef(new Map<string, Direction>())
  const readyScene = useCallback(() => setReady(true), [])
  const returned = useCallback(() => setStage('done'), [])
  useEffect(() => () => walker?.dispose(), [walker])

  const changeStage = useCallback((next: Stage) => {
    held.current.clear()
    setStage(next)
  }, [])

  useEffect(() => {
    if (stage !== 'ride') return
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setSeconds(left)
      if (!left) changeStage('return')
    }, 200)
    return () => window.clearInterval(timer)
  }, [changeStage, endsAt, stage])

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || !ready) return
      if (stage === 'walk' && near && event.code === 'KeyE' && !event.repeat) {
        event.preventDefault()
        changeStage('rent')
        return
      }
      const direction = keys.get(event.code)
      if (!direction || (stage !== 'walk' && stage !== 'ride')) return
      event.preventDefault()
      held.current.set(event.code, direction)
    }
    const up = (event: KeyboardEvent) => { held.current.delete(event.code) }
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [changeStage, near, ready, stage])

  const launch = () => {
    if (stage !== 'rent' || (!walker && balance < fare)) return
    if (!walker) setBalance(balance - fare)
    setEndsAt(Date.now() + duration)
    setSeconds(duration / 1000)
    changeStage('ride')
  }
  const time = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':')
  return <section className="duck-boat-preview" aria-label="공원에서 오리배 타기">
    <SceneBoundary>
      <Canvas camera={{ fov: 52, near: .15, far: 1200 }} dpr={[1, 1.25]}
        gl={{ preserveDrawingBuffer: true }} aria-label="리뉴얼 공원 3D 호수">
        <Suspense fallback={null}>
          <Scene dock={dock} walker={walker} stage={stage} held={held} onReach={setNear} onReturned={returned} onReady={readyScene} />
        </Suspense>
      </Canvas>
    </SceneBoundary>
    {!ready && <p className="duck-boat-message" role="status">호수공원을 불러오는 중이에요…</p>}
    {ready && <>
      <header className="duck-boat-title">
        <strong>{walker ? '220m 공원 산책' : '버들호수'}</strong>
        <span>오리배 선착장</span>
        {walker && <a href="./park-renewal.html">전체 전경</a>}
      </header>
      {stage === 'walk' && <div className="duck-boat-dock-prompt">
        {near
          ? <button className="duck-boat-button" onClick={() => changeStage('rent')}>오리배 대여 <kbd>E</kbd></button>
          : <span>{walker ? '호숫가의 나무 선착장으로 걸어가세요' : '선착장 입구로 이동하세요'}</span>}
      </div>}
      {stage === 'ride' && <>
        <div className="duck-boat-trip"><span>운전석</span><span aria-label="남은 시간">{time}</span></div>
        {seconds <= 30 && <p className="duck-boat-warning" role="status">곧 선착장으로 돌아가요.</p>}
        <button className="duck-boat-button duck-boat-return" onClick={() => changeStage('return')}>선착장으로 돌아가기</button>
      </>}
      {stage === 'return' && <p className="duck-boat-warning" role="status">선착장으로 돌아가는 중이에요.</p>}
      {(stage === 'walk' || stage === 'ride') && <div className="duck-boat-controls" aria-label="이동 조작">
        <p>{stage === 'ride' ? 'W/S 전진·후진 · A/D 방향 전환' : 'WASD 또는 방향키로 이동'}</p>
        <div className="duck-boat-directions">
          {controls.map(([direction, symbol, label]) => <button key={direction} type="button"
            aria-label={label} onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId)
              held.current.set('pointer-' + event.pointerId, direction)
            }}
            onLostPointerCapture={event => held.current.delete('pointer-' + event.pointerId)}>
            {symbol}
          </button>)}
        </div>
      </div>}
    </>}
    {stage === 'rent' && <PaperPopup title="버들호수 · 오리배 선착장" label="오리배 대여"
      closeLabel="대여 창 닫기" className="duck-boat-paper" onClose={() => changeStage('walk')}>
      <h2>오리배 대여</h2>
      <p className="paper-subtitle">5분 동안 호수를 자유롭게 둘러보세요.</p>
      {walker
        ? <div className="duck-boat-fare">무료 체험 · 1인 탑승</div>
        : <div className="duck-boat-fare"><span>이용 요금 <strong>{fare}엽전</strong></span><span>체험 잔액 <strong>{balance}엽전</strong></span></div>}
      {!walker && balance < fare && <p role="alert">엽전이 부족해요.</p>}
      <button className="paper-primary" disabled={!walker && balance < fare} onClick={launch}>{walker ? '오리배 타기' : `${fare}엽전으로 출항`}</button>
    </PaperPopup>}
    {stage === 'done' && <PaperPopup title="버들호수 · 오리배 선착장" label="반납 완료"
      closeLabel="반납 창 닫기" className="duck-boat-paper" onClose={() => changeStage('walk')}>
      <h2>반납 완료</h2>
      <p className="paper-subtitle">선착장에 도착했어요.</p>
      <button className="paper-primary" onClick={() => changeStage('walk')}>확인</button>
    </PaperPopup>}
  </section>
}

export async function mountDuckBoatPreview(mount: HTMLElement, parkWalk = false) {
  const root = createRoot(mount)
  root.render(<p className="duck-boat-message" role="status">호수공원을 불러오는 중이에요…</p>)
  try {
    const [map] = await Promise.all([
      requestRenewalMap() as Promise<{ data: ParkMapData }>,
      staticPark ?? restoreStaticPark(archive),
    ])
    const dock = duckBoatDock(map.data)
    const { DuckBoatScene } = await import('./DuckBoatScene')
    const walker = parkWalk ? await (await import('../../network/predictionPhysics')).createPredictionPhysics() : undefined
    root.render(<DuckBoatPreview Scene={DuckBoatScene} dock={dock} walker={walker} />)
  } catch (error) {
    console.error('오리배 체험을 불러오지 못했습니다.', error)
    root.render(<p className="duck-boat-message" role="alert">오리배 체험을 열지 못했어요. 새로고침해 주세요.</p>)
  }
}

const standalone = document.body.classList.contains('park-renewal-walking') ? null : document.getElementById('duck-boat-root')
if (standalone) void mountDuckBoatPreview(standalone)
