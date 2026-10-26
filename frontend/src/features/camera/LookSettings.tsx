import { useRef, useState } from 'react'
import {
  LOOK_SENSITIVITY, lookSensitivityLabel, setLookSensitivity, useLookSensitivity,
} from '../../world/lookSensitivity'

/** Sits with the mouse-look button so the speed is changed where the view is turned. */
export function LookSettings({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false)
  // Text being typed; a valid percentage applies at once, anything else is tidied on blur.
  const [draft, setDraft] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const sensitivity = useLookSensitivity(state => state.sensitivity)
  const close = () => {
    setOpen(false)
    setDraft(null)
    button.current?.focus({ preventScroll: true })
  }
  const type = (text: string) => {
    setDraft(text)
    const percent = Number(text)
    if (text !== '' && Number.isInteger(percent)
      && percent >= LOOK_SENSITIVITY.min && percent <= LOOK_SENSITIVITY.max) {
      setLookSensitivity(percent)
    }
  }
  return <>
    <button ref={button} type="button" className="park-quick-button" aria-controls="park-look-settings"
      aria-expanded={open} disabled={disabled} title="마우스로 시점을 돌리는 빠르기"
      onClick={() => setOpen(value => !value)}>
      <span>감도 {lookSensitivityLabel(sensitivity)}</span>
    </button>
    {open && <section id="park-look-settings" className="park-look-settings" aria-label="마우스 감도">
      <header><strong>마우스 감도</strong><button type="button" aria-label="마우스 감도 닫기" onClick={close}>×</button></header>
      <div className="park-look-row">
        <span>시점 회전</span>
        <input type="range" aria-label="시점 회전 빠르기" min={LOOK_SENSITIVITY.min} max={LOOK_SENSITIVITY.max}
          step={LOOK_SENSITIVITY.step} value={sensitivity} aria-valuetext={lookSensitivityLabel(sensitivity)}
          onChange={event => { setDraft(null); setLookSensitivity(Number(event.target.value)) }} />
        <input type="number" aria-label="감도 퍼센트" inputMode="numeric" min={LOOK_SENSITIVITY.min}
          max={LOOK_SENSITIVITY.max} step={LOOK_SENSITIVITY.step} value={draft ?? String(sensitivity)}
          onChange={event => type(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.currentTarget.blur()
          }} />
        <span aria-hidden="true">%</span>
      </div>
      <p>{LOOK_SENSITIVITY.min}~{LOOK_SENSITIVITY.max}% 사이에서 골라요. 공원 시점(마우스룩·드래그), 테이블·벤치에서 둘러보기, 망원경에 함께 적용되고 이 브라우저에 저장돼요.</p>
      <button type="button" disabled={sensitivity === LOOK_SENSITIVITY.initial}
        onClick={() => { setDraft(null); setLookSensitivity(LOOK_SENSITIVITY.initial) }}>
        기본값({lookSensitivityLabel(LOOK_SENSITIVITY.initial)})
      </button>
    </section>}
  </>
}
