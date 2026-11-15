import { useEffect, useRef } from 'react'
import moleArt from '../mole/assets/thumbnail.webp'
import speedArt from '../speedMole/assets/thumbnail.webp'
import { closeArcade, playArcadeGame } from './store'
import './moleModePicker.css'

const modes = [
  {
    id: 'whack-a-mole',
    name: '두더지 잡기',
    art: moleArt,
    description: '튀어나온 두더지를 타이밍에 맞춰 잡아요.',
  },
  {
    id: 'speed-mole',
    name: '스피드 두더지 잡기',
    art: speedArt,
    description: '잡자마자 나타나는 두더지를 연속으로 잡아요.',
  },
] as const

export function MoleModePicker() {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    title.current?.focus({ preventScroll: true })
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="mole-mode-picker"
      aria-labelledby="mole-mode-picker-title"
      onCancel={event => { event.preventDefault(); closeArcade() }}
    >
      <h2 ref={title} id="mole-mode-picker-title" tabIndex={-1}>두더지 모드 선택</h2>
      <div className="mole-mode-picker__cards">
        {modes.map(mode => (
          <button
            key={mode.id}
            type="button"
            className="mole-mode-card"
            data-mode={mode.id}
            aria-labelledby={`${mode.id}-mode-name`}
            aria-describedby={`${mode.id}-mode-description`}
            onClick={() => playArcadeGame(mode.id)}
          >
            <img src={mode.art} alt="" />
            <strong id={`${mode.id}-mode-name`}>{mode.name}</strong>
            <span id={`${mode.id}-mode-description`}>{mode.description}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mole-mode-picker__close"
        aria-keyshortcuts="Escape"
        onClick={closeArcade}
      >닫기 <kbd>Esc</kbd></button>
    </dialog>
  )
}
