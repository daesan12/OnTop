import { useEffect, useRef, useState } from 'react'
import { NpcDialogueFrame } from '../ai/NpcDialogueFrame'
import { hasPendingWelcomeTour } from '../welcomeTour/pending'
import { welcomeReady } from '../welcomeTour/state'
import { clearRoamingInput, focusParkCanvas, panelOwnsKeys } from '../../world/inputOwnership'
import './parkWelcomeStory.css'

const portraitRoot = '/art/park-welcome'
const scenes = [
  {
    portrait: 'welcome.webp',
    dialogue: '허허, 어서 오게. 온탑 공원에 온 걸 환영하네! 나는 박영감이라고 하네.',
  },
  {
    portrait: 'fortune.webp',
    dialogue: '어디부터 둘러볼지 모르겠으면 운세방에 들러 운세함을 열어 보게. 공원에 뭐가 새로 생겼는지는 ‘이벤트/공지’의 패치노트에 적혀 있다네.',
  },
] as const

export function ParkWelcomeStory({ blocked, onComplete }: {
  blocked: boolean
  onComplete: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(0)
  const scene = scenes[index]!
  const last = index === scenes.length - 1

  useEffect(() => {
    for (const scene of scenes) {
      const portrait = new Image()
      portrait.src = portraitRoot + '/' + scene.portrait
    }
  }, [])

  useEffect(() => {
    if (blocked || !dialog.current) return
    const element = dialog.current
    const showWhenReady = () => {
      if (!welcomeReady() || hasPendingWelcomeTour() || panelOwnsKeys()) return false
      clearRoamingInput()
      if (document.pointerLockElement) document.exitPointerLock()
      element.showModal()
      element.focus({ preventScroll: true })
      return true
    }
    const timer = showWhenReady() ? undefined : window.setInterval(() => {
      if (showWhenReady()) window.clearInterval(timer)
    }, 250)

    return () => {
      window.clearInterval(timer)
      if (!element.open) return
      element.close()
      clearRoamingInput()
      focusParkCanvas()
    }
  }, [blocked])

  function advance() {
    if (last) onComplete()
    else setIndex(index + 1)
  }

  return <dialog ref={dialog} className="joke-dialog park-welcome-story" tabIndex={-1}
    aria-labelledby="park-welcome-speaker"
    onCancel={event => { event.preventDefault(); onComplete() }}
    onKeyDown={event => {
      if (event.key !== 'Enter' || event.target !== event.currentTarget) return
      event.preventDefault()
      if (!event.repeat) advance()
    }}>
    <NpcDialogueFrame portrait={portraitRoot + '/' + scene.portrait} portraitAlt="">
      <header className="joke-dialogue-heading">
        <h2 id="park-welcome-speaker" className="joke-nameplate">
          <span aria-hidden="true">✥</span> 박영감 <span aria-hidden="true">✥</span>
        </h2>
        <button type="button" className="joke-close" onClick={onComplete}>
          <kbd aria-hidden="true">ESC</kbd> 건너뛰기 <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="joke-speech" aria-live="polite"><p>{scene.dialogue}</p></div>
      <footer className="joke-dialogue-actions">
        <span className="park-welcome-story__progress" aria-label={`전체 ${scenes.length}장 중 ${index + 1}장`}>
          {index + 1} / {scenes.length}
        </span>
        <button type="button" className="joke-next park-welcome-story__next" onClick={advance}>
          {last ? '공원 둘러보기' : '다음'} <span aria-hidden="true">▸</span>
        </button>
      </footer>
    </NpcDialogueFrame>
  </dialog>
}
