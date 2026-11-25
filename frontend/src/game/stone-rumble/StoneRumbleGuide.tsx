import { memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParkXR } from '../../features/parkXR/state'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { useSession } from '../../network/worldClient'
import { focusParkCanvas } from '../../world/inputOwnership'
import { closeStoneRumbleGuide, stoneRumbleGuideScope, useStoneRumbleGuide } from './guideState'
import { stoneRumbleManual } from './manual'
import './stone-rumble-guide.css'

export const StoneRumbleGuide = memo(function StoneRumbleGuide() {
  const scope = useStoneRumbleGuide(state => state.scope)
  const context = useSession(stoneRumbleGuideScope)
  const roaming = useSession(state => state.status === 'connected' && state.mapCompatible && !state.tableId)
  const xrActive = useParkXR(state => state.phase !== 'idle')
  const visible = !!scope && scope === context && roaming && !xrActive
  const scrollArea = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scope && !visible) closeStoneRumbleGuide()
  }, [scope, visible])
  useEffect(() => () => {
    if (useStoneRumbleGuide.getState().scope) closeStoneRumbleGuide()
  }, [])

  if (!visible) return null

  const close = () => {
    closeStoneRumbleGuide()
    requestAnimationFrame(() => focusParkCanvas())
  }
  return createPortal(<PaperPopup title="미니게임 · 준비 안내" label="돌탑 생존전 준비 안내"
    className="stone-rumble-guide" closeLabel="돌탑 생존전 안내 닫기" onClose={close} initialFocusRef={scrollArea}>
    <div className="stone-rumble-guide-scroll" ref={scrollArea} tabIndex={0} role="region" aria-label="돌탑 생존전 규칙과 조작">
      <header className="stone-rumble-guide-intro">
        <div>
          <h2>{stoneRumbleManual.title}</h2>
          <p><strong>{stoneRumbleManual.players}</strong>이 함께 도전해요. {stoneRumbleManual.subtitle}.</p>
          <p>{stoneRumbleManual.summary}</p>
        </div>
        <img src="/art/stone-rumble/cover-v3.webp" alt="돌탑 발판 위에서 비둘기를 날리는 생존전 참가자" />
      </header>
      <ol className="stone-rumble-guide-steps" aria-label="돌탑 생존전 놀이 방법">
        {stoneRumbleManual.flow.map(({ title, body }, index) => <li key={title}>
          <h3><span aria-hidden="true">{index + 1}</span>{title}</h3><p>{body}</p>
        </li>)}
      </ol>
      <p className="stone-rumble-guide-collapse">{stoneRumbleManual.points[0]}</p>
      <div className="stone-rumble-guide-controls" aria-label="돌탑 생존전 조작">
        <span><kbd>WASD</kbd> 이동</span><span><kbd>마우스</kbd> 시점 · <kbd>Esc</kbd> 해제</span><span><kbd>Space</kbd> 점프</span>
        <span><kbd>Shift</kbd> 다이빙</span><span><kbd>E</kbd> 비둘기 발사</span>
      </div>
    </div>
    <footer className="stone-rumble-guide-footer">
      <button type="button" className="paper-primary stone-rumble-guide-dismiss" onClick={close}>안내 닫기</button>
      <p className="stone-rumble-guide-close-hint"><kbd>Esc</kbd> 안내 닫기</p>
    </footer>
  </PaperPopup>, document.body)
})
