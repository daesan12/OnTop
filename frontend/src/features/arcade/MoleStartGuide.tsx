import type { ReactNode } from 'react'
import moleArt from '../mole/assets/mole.webp'
import holeArt from '../mole/assets/hole.webp'
import './mole-start-guide.css'

/** Shared introduction only: each game keeps its own input, timer, scoring and server service. */
export function MoleStartGuide({ name, headline, description, seconds, keyGroups, twoRows = false, details, error, extra, onStart, onClose, onManual }: {
  name: string; headline: string; description: ReactNode; seconds: number
  keyGroups: readonly (readonly string[])[]; twoRows?: boolean; details: ReactNode; error?: string; extra?: ReactNode
  onStart: () => void; onClose: () => void; onManual?: () => void
}) {
  return <div className="mole-start-guide">
    <button type="button" className="mole-start-guide__close" onClick={onClose} aria-label={`${name} 닫기`}>×</button>
    <section className="mole-start-guide__card" aria-label={`${name} 시작 안내`}>
      <div className="mole-start-guide__art" aria-hidden="true"><strong>{name}</strong><img src={moleArt} alt="" /><img src={holeArt} alt="" /><span>{seconds}초 도전</span></div>
      <div className="mole-start-guide__content"><span className="mole-start-guide__brand">온탑 오락실</span><h2>{headline}</h2><p>{description}</p>
        <div className="mole-start-guide__controls"><b>이 키들로 두더지를 잡아요</b><div className="mole-start-guide__keys" data-two-rows={twoRows}>{keyGroups.map((keys,index)=><div key={index}>{keys.map(key=><kbd key={key}>{key}</kbd>)}</div>)}</div><small>두더지가 나온 구멍의 키를 누르거나 클릭하세요.</small></div>
        <div className="mole-start-guide__details">{details}</div>
        {error && <p className="mole-start-guide__error" role="alert">{error}</p>}
        <button type="button" className="mole-start-guide__start" onClick={onStart}>도전 시작 <kbd>Enter</kbd></button>
        {extra && <div className="mole-start-guide__extra">{extra}</div>}
        {onManual && <button type="button" className="mole-start-guide__manual" onClick={onManual}>자세한 설명서</button>}
        <small className="mole-start-guide__hint">Enter / Space로 시작 · 3초 준비 후 {seconds}초 도전</small>
      </div>
    </section>
  </div>
}
