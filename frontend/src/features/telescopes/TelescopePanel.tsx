import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TELESCOPE } from '../../config'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { telescopeView, zoomTelescope } from '../telescopeView'
import { leaveTelescope } from './controller'
import { useTelescopeState } from './state'
import './telescopes.css'

export function TelescopePanel() {
  const id = useSession(s => s.telescopeId)
  const connected = useSession(s => s.status === 'connected')
  const { pending, error } = useTelescopeState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const [zoom, setZoom] = useState(telescopeView.zoom)
  const [guide, setGuide] = useState(false)
  const guideOpen = useRef(false)
  const closeGuideButton = useRef<HTMLButtonElement>(null)
  const toggleGuide = (open: boolean) => {
    guideOpen.current = open
    inputState.manualOpen = open
    setGuide(open)
    clearRoamingInput()
    if (!open) document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!id) return
    setZoom(telescopeView.zoom)
    const timer = setInterval(() => setZoom(telescopeView.zoom), 100)
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'F1') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat) toggleGuide(!guideOpen.current)
      } else if (guideOpen.current && event.code === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        toggleGuide(false)
      } else if (guideOpen.current && event.code === 'Tab') {
        event.preventDefault()
        closeGuideButton.current?.focus()
      }
    }
    window.addEventListener('keydown', keys, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', keys, true)
      if (guideOpen.current) { guideOpen.current = false; inputState.manualOpen = false; setGuide(false) }
    }
  }, [id])
  useEffect(() => { if (guide) closeGuideButton.current?.focus() }, [guide])
  const changeZoom = (delta: number) => {
    zoomTelescope(delta)
    setZoom(telescopeView.zoom)
  }
  if (!id || !connected) return error ? <aside className="telescope-error" role="alert">{error}
    <button type="button" onClick={() => useTelescopeState.setState({ error: '' })}>닫기</button></aside> : null
  return <>
    <div className="telescope-viewfinder" aria-hidden="true"><span /></div>
    <aside className="telescope-panel park-runtime-panel" aria-label="전망 망원경" data-telescope-id={id}>
      <div><strong>전망 망원경 · 목업</strong><output aria-label="확대 배율">{zoom.toFixed(1)}×</output></div>
      <p>드래그로 방향 · 휠로 확대</p>
      <div className="telescope-actions">
        <button type="button" aria-label="망원경 축소" disabled={pending || zoom <= TELESCOPE.minZoom}
          onClick={event => { changeZoom(-0.5); event.currentTarget.blur() }}>−</button>
        <button type="button" aria-label="망원경 확대" disabled={pending || zoom >= TELESCOPE.maxZoom}
          onClick={event => { changeZoom(0.5); event.currentTarget.blur() }}>＋</button>
        <button type="button" aria-label="망원경에서 나가기" aria-keyshortcuts="E Escape" disabled={pending}
          onClick={event => { void leaveTelescope(); event.currentTarget.blur() }}>나가기 · E / Esc</button>
      </div>
      <button type="button" aria-label="망원경 설명서 열기" onClick={() => toggleGuide(true)}>조작 설명 · F1</button>
      <small>점유·방향은 현재 화면의 목업입니다. 확대는 나에게만 적용됩니다.</small>
      {pending && <span role="status">망원경 반납 확인 중…</span>}
      {error && <div role="alert">{error}</div>}
    </aside>
    {guide && <div className="telescope-guide-backdrop">
      <section className="telescope-guide park-runtime-panel" role="dialog" aria-modal="true" aria-label="망원경 조작 설명">
        <strong>망원경 조작 설명</strong>
        <p>화면을 드래그해 방향을 바꾸고, 휠이나 ＋/− 버튼으로 2~8배 확대합니다.</p>
        <p>이용 중에는 이동과 점프가 멈춥니다. 설명서를 닫고 E 또는 Esc로 망원경에서 나옵니다.</p>
        <button ref={closeGuideButton} type="button" onClick={() => toggleGuide(false)}>설명서 닫기 · F1 / Esc</button>
      </section>
    </div>}
  </>
}
