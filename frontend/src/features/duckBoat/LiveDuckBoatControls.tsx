import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput, focusParkCanvas, inputState, textInputOwnsKeys } from '../../world/inputOwnership'
import { closeConstructionNotice } from '../construction/model'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { useLiveDuckBoat } from './liveState'
import './liveDuckBoat.css'

export function DuckBoatRental() {
  const runtime = useParkRuntime()
  const occupied = useLiveDuckBoat(state => !!state.boat)
  const modelReady = useLiveDuckBoat(state => state.modelReady)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  async function rent() {
    if (pending || occupied || !modelReady) return
    setPending(true)
    if (await runtime.rentDuckBoat?.()) {
      closeConstructionNotice()
    } else {
      setPending(false)
      setError(true)
    }
  }
  return <PaperPopup title="버들호수 · 오리배 선착장" label="오리배 대여" closeLabel="대여 창 닫기"
    className="live-duck-boat-rental" onClose={closeConstructionNotice}>
    <h2>오리배 대여</h2>
    <p className="paper-subtitle">무료 · 1인 탑승 · 5분</p>
    {occupied && <p role="status">오리배가 운항 중이에요.</p>}
    {!occupied && !modelReady && <p role="status">오리배를 불러오는 중이에요.</p>}
    {error && !occupied && <p role="alert">출항하지 못했어요. 선착장 가까이에서 다시 시도해 주세요.</p>}
    <button type="button" className="paper-primary" disabled={pending || occupied || !modelReady} onClick={() => void rent()}>오리배 타기</button>
  </PaperPopup>
}

const keys = new Map([
  ['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
  ['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
])

export function LiveDuckBoatControls() {
  const userId = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected')
  const riding = useLiveDuckBoat(s => !!s.boat && s.boat.userId === userId)
  return connected && riding ? <DuckBoatHud /> : null
}

function DuckBoatHud() {
  const runtime = useParkRuntime()
  const [seconds, setSeconds] = useState(() => Math.ceil((useLiveDuckBoat.getState().boat?.remainingMs ?? 0) / 1000))
  const [returning, setReturning] = useState(false)
  const held = useRef(new Map<string, string>())

  useEffect(() => {
    let active = true
    let pending = false
    let moving = false
    const expires = performance.now() + (useLiveDuckBoat.getState().boat?.remainingMs ?? 0)
    const clear = () => held.current.clear()
    const down = (event: KeyboardEvent) => {
      const key = keys.get(event.code)
      if (!key || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || textInputOwnsKeys(event.target)) return
      event.preventDefault()
      held.current.set(event.code, key)
    }
    const up = (event: KeyboardEvent) => { held.current.delete(event.code) }
    const interval = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((expires - performance.now()) / 1000)))
      if (pending || !active) return
      const blocked = Object.entries(inputState).some(([key, open]) => key !== 'duckBoat' && open)
        || !!document.querySelector('dialog[open],[role="dialog"]')
      const pressed = blocked ? [] : [...held.current.values()]
      const turn = Number(pressed.includes('right')) - Number(pressed.includes('left'))
      const throttle = Number(pressed.includes('forward')) - Number(pressed.includes('back'))
      if (!turn && !throttle && !moving) return
      moving = !!(turn || throttle)
      pending = true
      void runtime.steerDuckBoat?.(turn, throttle).catch(() => clear()).finally(() => { pending = false })
    }, 110)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('ontop-clear-input', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      active = false
      clear()
      window.clearInterval(interval)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('ontop-clear-input', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [runtime])

  async function returnBoat() {
    if (returning) return
    setReturning(true)
    clearRoamingInput()
    if (await runtime.returnDuckBoat?.()) focusParkCanvas()
    else setReturning(false)
  }

  return <section className="live-duck-boat-hud" aria-label="오리배 운항">
    <div>운전석 <strong aria-label="남은 시간">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></div>
    <p>{seconds <= 30 ? '곧 선착장으로 돌아가요.' : 'W/S 전진·후진 · A/D 방향 전환'}</p>
    <div className="live-duck-boat-directions">
      {[['forward','↑','전진'],['left','←','좌회전'],['back','↓','후진'],['right','→','우회전']].map(([direction, mark, label]) =>
        <button key={direction} type="button" aria-label={label} onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId)
          held.current.set('pointer-' + event.pointerId, direction!)
        }} onLostPointerCapture={event => held.current.delete('pointer-' + event.pointerId)}>{mark}</button>)}
    </div>
    <button type="button" disabled={returning} onClick={() => void returnBoat()}>선착장에 반납</button>
  </section>
}
