import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TELESCOPE } from '../../config'
import { useSession } from '../../network/worldClient'
import { openManual } from '../manual/manualState'
import { telescopeView, zoomTelescope } from '../telescopeView'
import { leaveTelescope } from './controller'
import { useTelescopeState } from './state'
import { telescopeService } from './service'
import './telescopes.css'

export function TelescopePanel() {
  const id = useSession(s => s.telescopeId)
  const connected = useSession(s => s.status === 'connected')
  const { pending, error } = useTelescopeState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const [zoom, setZoom] = useState(telescopeView.zoom)
  useEffect(() => {
    if (!id) return;
    setZoom(telescopeView.zoom);
    const timer = setInterval(() => setZoom(telescopeView.zoom), 100);
    return () => clearInterval(timer);
  }, [id]);
  const changeZoom = (delta: number) => {
    zoomTelescope(delta)
    setZoom(telescopeView.zoom)
  }
  if (!id || !connected) return error ? <aside className="telescope-error" role="alert">{error}
    <button type="button" onClick={() => useTelescopeState.setState({ error: '' })}>닫기</button></aside> : null
  return <>
    <div className="telescope-viewfinder" aria-hidden="true"><span /></div>
    <aside className="telescope-panel park-runtime-panel" aria-label="전망 망원경" data-telescope-id={id}>
      <div><strong>전망 망원경{telescopeService.mode === 'mock' ? ' · 목업' : ''}</strong><output aria-label="확대 배율">{zoom.toFixed(1)}×</output></div>
      <p>드래그로 방향 · 휠로 확대</p>
      <div className="telescope-actions">
        <button type="button" aria-label="망원경 축소" disabled={pending || zoom <= TELESCOPE.minZoom}
          onClick={event => { changeZoom(-0.5); event.currentTarget.blur() }}>−</button>
        <button type="button" aria-label="망원경 확대" disabled={pending || zoom >= TELESCOPE.maxZoom}
          onClick={event => { changeZoom(0.5); event.currentTarget.blur() }}>＋</button>
        <button type="button" aria-label="망원경에서 나가기" aria-keyshortcuts="E Escape" disabled={pending}
          onClick={event => { void leaveTelescope(); event.currentTarget.blur() }}>나가기 · E / Esc</button>
      </div>
      <button type="button" aria-label="망원경 설명서 열기" onClick={() => openManual('controls')}>조작 설명 · F1</button>
      <small>{telescopeService.mode === 'mock' ? '점유·방향은 현재 화면의 목업입니다.' : '점유·방향은 서버가 동기화합니다.'} 확대는 나에게만 적용됩니다.</small>
      {pending && <span role="status">망원경 반납 확인 중…</span>}
      {error && <div role="alert">{error}</div>}
    </aside>

  </>
}
