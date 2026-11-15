import { useEffect, useState } from 'react'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { parkXRActions, useParkXR } from './state'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { TouchControllerGuide } from '../vrGuide/TouchControllerDiagram'
import { clearRoamingInput } from '../../world/inputOwnership'
import { canStartJumpmapXR } from '../jumpmap/xrEntry'
import { useJumpmap } from '../jumpmap/state'
import { XRComfortFields } from './XRComfortFields'
import './parkXR.css'

export function ParkXRControls() {
  const [supported, setSupported] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [near, setNear] = useState(false)
  const available = useJumpmap(s => s.available)
  const ready = useParkXR(s => s.ready)
  const phase = useParkXR(s => s.phase)
  const error = useParkXR(s => s.error)
  const notice = useParkXR(s => s.notice)
  const connected = useSession(s => s.status === 'connected' && s.mapCompatible && !!s.roomId
    && !s.tableId && !s.benchId && !s.fitnessId && !s.telescopeId)
  useEffect(() => {
    let alive = true
    const check = () => {
      if (window.isSecureContext && navigator.xr)
        void navigator.xr.isSessionSupported('immersive-vr').then(value => { if (alive) setSupported(value) }).catch(() => { if (alive) setSupported(false) })
    }
    check(); navigator.xr?.addEventListener('devicechange', check)
    return () => { alive = false; navigator.xr?.removeEventListener('devicechange', check) }
  }, [])
  useEffect(() => {
    if (!guideOpen && !settingsOpen) return
    clearRoamingInput()
    return clearRoamingInput
  }, [guideOpen, settingsOpen])
  useEffect(() => { if (!connected || phase === 'active') { setGuideOpen(false); setSettingsOpen(false) } }, [connected, phase])
  useEffect(() => {
    const check = () => {
      const own = avatars.get(useSession.getState().sessionId)
      setNear(!!own && !own.carry && !own.swimming && canStartJumpmapXR(sampleAvatar(own, performance.now(), { ...own.current })))
    }
    check(); const timer = setInterval(check, 100)
    return () => clearInterval(timer)
  }, [])
  if (!supported && !error) return null
  const busy = phase === 'requesting' || phase === 'ending'
  const atJumpmap = near && available
  const name = phase === 'idle' && atJumpmap ? '돌탑 점프맵' : '공원'
  return <><aside className="park-xr-controls" aria-label="공원 VR 조작" tabIndex={0}>
    <button type="button" disabled={busy || !ready || !connected} onClick={event => {
      event.currentTarget.blur()
      if (phase === 'active') void parkXRActions.end?.()
      else void (atJumpmap ? parkXRActions.startJumpmap?.() : parkXRActions.start?.())
    }}>{phase === 'active' ? `${name} VR 종료` : busy ? 'VR 연결 중…' : `${name} VR 시작`}</button>
    <button type="button" className="park-xr-guide-button" disabled={busy} onPointerDown={event => {
      if (phase === 'active') event.preventDefault()
    }} onClick={event => {
      event.currentTarget.blur()
      if (phase === 'active') parkXRActions.guide?.()
      else setGuideOpen(true)
    }}>VR 조작 안내</button>
    <button type="button" className="park-xr-guide-button" disabled={busy} onPointerDown={event => {
      if (phase === 'active') event.preventDefault()
    }} onClick={event => {
      event.currentTarget.blur()
      if (phase === 'active') parkXRActions.settings?.()
      else setSettingsOpen(true)
    }}>VR 편안함 설정</button>
    <p>공원을 VR로 둘러보고 돌탑 점프맵에도 도전해요.<br />떨어져도 VR은 유지돼요. 스틱으로 출발점에 돌아가세요.<br />왼쪽 스틱 이동 · A 점프 · 왼손 그립 달리기<br />오른쪽 스틱 회전 · X 조작 안내 · B 종료</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </aside>
    {guideOpen && phase !== 'active' ? <PaperPopup title={`${name} · Quest Touch 컨트롤러`} label={`${name} VR 조작 안내`} className="park-vr-guide-paper" closeLabel={`${name} VR 안내 닫기`} onClose={() => setGuideOpen(false)}>
      <h2>{name} VR 조작 안내</h2>
      <p>왼쪽 스틱으로 걷고 고개를 돌려 공원을 둘러보세요.<br />돌탑 첫 발판을 밟으면 점프맵이 시작돼요. 떨어져도 VR을 유지하므로 출발점으로 돌아가 다시 도전할 수 있어요.<br />이동 중 왼손 그립을 누르면 달려요. 점프는 오른손 A 버튼이에요.</p>
      <TouchControllerGuide mode="park" />
      <p>오른쪽 스틱의 회전 방식과 속도, 앉기·서기 눈높이는 ‘VR 편안함 설정’에서 선택해요. VR 안에서도 X 안내판에서 열 수 있어요.</p>
      <p>VR 안에서는 <strong>왼손 X</strong>로 안내판을 열고 닫아요. 평소에는 정면 안내판을 표시하지 않아요.<br />안내판의 ‘공원 조작 안내’와 ‘돌탑 놀이 방법’을 가리켜 트리거로 바꿔 볼 수 있어요.<br />꼬치왕 입구에서는 ‘꼬치왕 입장’ 버튼을 가리켜 검지 트리거로 선택하세요. 준비 화면으로 이동해요.</p>
      <p>실제로 뛰지 않고 버튼으로 점프해요. 안내판을 닫으면 공원 이동을 계속할 수 있어요.<br />VR 중에는 다른 유저가 잡거나 던질 수 없어요. 오른손 B로 VR을 종료하면 일반 공원 화면으로 돌아와요.</p>
      <button className="paper-primary" type="button" onClick={() => setGuideOpen(false)}>안내 닫기</button>
    </PaperPopup> : null}
    {settingsOpen && phase !== 'active' ? <PaperPopup title="VR 편안함 설정" label="VR 편안함 설정" className="park-vr-guide-paper" closeLabel="VR 설정 닫기" onClose={() => setSettingsOpen(false)}>
      <h2>내게 맞는 VR 조작</h2>
      <XRComfortFields />
      <button className="paper-primary" type="button" onClick={() => setSettingsOpen(false)}>설정 완료</button>
    </PaperPopup> : null}
  </>
}
