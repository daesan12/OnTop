import { useRef, useState } from 'react'
import { LOOK_SENSITIVITY, setLookSensitivity, useLookSensitivity } from '../../world/lookSensitivity'

/** Sits with the mouse-look button so the speed is changed where the view is turned. */
export function LookSettings({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const sensitivity = useLookSensitivity(state => state.sensitivity)
  const close = () => {
    setOpen(false)
    button.current?.focus({ preventScroll: true })
  }
  return <>
    <button ref={button} type="button" className="park-quick-button" aria-controls="park-look-settings"
      aria-expanded={open} disabled={disabled} title="마우스룩과 드래그로 시점을 돌리는 빠르기"
      onClick={() => setOpen(value => !value)}>
      <span>감도 {sensitivity.toFixed(1)}</span>
    </button>
    {open && <section id="park-look-settings" className="park-look-settings" aria-label="마우스 감도">
      <header><strong>마우스 감도</strong><button type="button" aria-label="마우스 감도 닫기" onClick={close}>×</button></header>
      <label>시점 회전
        <input type="range" aria-label="시점 회전 배율" min={LOOK_SENSITIVITY.min} max={LOOK_SENSITIVITY.max}
          step={LOOK_SENSITIVITY.step} value={sensitivity}
          onChange={event => setLookSensitivity(Number(event.target.value))} />
        <output>{sensitivity.toFixed(1)}배</output>
      </label>
      <p>마우스룩(Ctrl)과 드래그 모두에 적용되고 이 브라우저에 저장돼요.</p>
      <button type="button" disabled={sensitivity === LOOK_SENSITIVITY.initial}
        onClick={() => setLookSensitivity(LOOK_SENSITIVITY.initial)}>기본값({LOOK_SENSITIVITY.initial.toFixed(1)}배)</button>
    </section>}
  </>
}
