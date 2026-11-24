import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, focusParkCanvas } from '../../world/inputOwnership'
import { NpcDialogueFrame } from './NpcDialogueFrame'
import { parkDialoguePortrait, parkDialoguePortraits, parkDialogues, type ParkSpeaker } from './parkDialogue'
import { closeParkDialogue, useParkDialogue } from './parkDialogueState'
import '../welcomeStory/parkWelcomeStory.css'

function Conversation({ speaker }: { speaker: ParkSpeaker }) {
  const element = useRef<HTMLDialogElement>(null), [index, setIndex] = useState(0)
  const story = parkDialogues[speaker], last = index === story.lines.length - 1
  const portrait = parkDialoguePortrait(speaker, index)
  useEffect(() => {
    for (const frame of parkDialoguePortraits(speaker)) {
      const image = new Image()
      image.src = frame.src
      void image.decode().catch(() => {})
    }
  }, [speaker])
  useEffect(() => {
    clearRoamingInput()
    if (document.pointerLockElement) document.exitPointerLock()
    element.current?.showModal(); element.current?.focus({ preventScroll: true })
    return () => { element.current?.close(); clearRoamingInput(); focusParkCanvas() }
  }, [])
  const next = () => last ? closeParkDialogue() : setIndex(value => value + 1)
  return <dialog ref={element} className="joke-dialog park-welcome-story park-npc-dialogue" tabIndex={-1}
    aria-labelledby="park-npc-speaker" onCancel={e => { e.preventDefault(); closeParkDialogue() }}
    onKeyDown={e => {
      if (e.key !== 'e' && e.key !== 'E' && (e.key !== 'Enter' || e.target !== e.currentTarget)) return
      e.preventDefault(); e.stopPropagation(); if (!e.repeat) next()
    }}>
    <NpcDialogueFrame portrait={portrait.src} portraitAlt={portrait.alt}>
      <header className="joke-dialogue-heading"><h2 className="joke-nameplate" id="park-npc-speaker">{story.name}</h2>
        <button type="button" className="joke-close" onClick={closeParkDialogue}>대화 닫기 <span aria-hidden="true">×</span></button></header>
      <div className="joke-speech" aria-live="polite" tabIndex={0}><p>{story.lines[index]}</p></div>
      <footer className="joke-dialogue-actions"><span className="park-welcome-story__progress">{index + 1} / {story.lines.length}</span>
        <button type="button" className="joke-next park-welcome-story__next" onClick={next}>{last ? '대화 마치기' : '다음'} <kbd>E</kbd></button></footer>
    </NpcDialogueFrame>
  </dialog>
}

export function ParkNpcDialogue() {
  const dialogue = useParkDialogue()
  const scope = useSession(s => `${s.sessionId}:${s.roomId}`), connected = useSession(s => s.status === 'connected')
  const seated = useSession(s => !!(s.tableId || s.benchId))
  useEffect(() => {
    if (dialogue.speaker && (!connected || seated || scope !== dialogue.scope)) closeParkDialogue()
  }, [connected, seated, scope, dialogue.scope, dialogue.speaker])
  return dialogue.speaker && connected && !seated && scope === dialogue.scope
    ? <Conversation key={`${scope}:${dialogue.speaker}`} speaker={dialogue.speaker} /> : null
}
