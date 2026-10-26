import { useState } from 'react'
import { LOOK_SENSITIVITY, lookSensitivityLabel, setLookSensitivity, useLookSensitivity } from './lookSensitivity'

/** Inline control for the F1 utility row, next to graphics quality. */
export function LookSensitivityControl() {
  // Text being typed; a valid percentage applies at once, anything else is tidied on blur.
  const [draft, setDraft] = useState<string | null>(null)
  const sensitivity = useLookSensitivity(state => state.sensitivity)
  const type = (text: string) => {
    setDraft(text)
    const percent = Number(text)
    if (text !== '' && Number.isInteger(percent)
      && percent >= LOOK_SENSITIVITY.min && percent <= LOOK_SENSITIVITY.max) {
      setLookSensitivity(percent)
    }
  }
  return <div className="manual-look-control" role="group" aria-label="마우스 감도"
    title={`공원 시점, 테이블·벤치 둘러보기, 망원경에 함께 적용돼요. 기본값 ${lookSensitivityLabel(LOOK_SENSITIVITY.initial)}`}>
    <span>마우스 감도</span>
    <input type="range" aria-label="마우스 감도 빠르기" min={LOOK_SENSITIVITY.min} max={LOOK_SENSITIVITY.max}
      step={LOOK_SENSITIVITY.step} value={sensitivity} aria-valuetext={lookSensitivityLabel(sensitivity)}
      onChange={event => { setDraft(null); setLookSensitivity(Number(event.target.value)) }} />
    <input type="number" aria-label="마우스 감도 퍼센트" inputMode="numeric" min={LOOK_SENSITIVITY.min}
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
}
