import type { ReactNode } from 'react'
import '../../ai-park/jokeContest.css'

function Knot({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 64 24" fill="none" aria-hidden="true"><path d="M2 12h13L27 2l12 10-12 10-12-10L27 2M62 12H49L37 2 25 12l12 10 12-10L37 2M19 12l13-8 13 8-13 8z" stroke="currentColor" strokeWidth="1.6" /></svg>
}

export function NpcDialogueFrame({ children, portrait, portraitAlt }: {
  children: ReactNode
  portrait: string
  portraitAlt: string
}) {
  return <>
    <div className="joke-dialogue-frame">
      <Knot className="joke-knot joke-knot-top" /><Knot className="joke-knot joke-knot-bottom" />
      <span className="joke-corner joke-corner-tl" aria-hidden="true" /><span className="joke-corner joke-corner-tr" aria-hidden="true" /><span className="joke-corner joke-corner-bl" aria-hidden="true" /><span className="joke-corner joke-corner-br" aria-hidden="true" />
      <svg className="joke-ink-landscape" viewBox="0 0 400 160" aria-hidden="true"><path d="m0 160 95-73 52 35 77-63 176 101z" /><path d="M277 160 282 53l-37 30 27-48 21-25 23 26-13-5 35 31-36-12 42 33-47-14-1 91zM345 160l-5-47-36-8 33-6-16-20 27 12 17-35 3 33 29-14-24 27 27 9-34 2-5 47z" /></svg>
      <div className="joke-dialogue-copy">{children}</div>
    </div>
    <img className="joke-portrait" src={portrait} alt={portraitAlt} width="440" height="440" />
  </>
}
