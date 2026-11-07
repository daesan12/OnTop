import { useEffect, useRef } from 'react'
import { paintTouchControllerGuide, touchBindings, type TouchGuideMode } from './touchControllerGuide'
import './touchGuide.css'

/** Same code-drawn diagram as the immersive panel, with an accessible text description. */
export function TouchControllerGuide({ mode }: { mode: TouchGuideMode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 1536, 590)
    ctx.save(); ctx.translate(0, -220); paintTouchControllerGuide(ctx, mode); ctx.restore()
  }, [mode])
  const description = touchBindings(mode).map(([title, detail], i) => `${i + 1}. ${title}: ${detail}`).join(' · ')
  return <figure className="vr-touch-guide-figure"><canvas ref={canvas} className="vr-touch-guide" width="1536" height="590" role="img"
    aria-label={`좌우 컨트롤러 버튼 위치와 조작법. ${description}`}
    style={{ display: 'block', width: '100%', height: 'auto' }} />
    <ol className="vr-touch-guide-legend" aria-label="컨트롤러 번호별 조작법">{touchBindings(mode).map(([title, detail], i) =>
      <li key={title}><b>{i + 1}</b><div><strong>{title}</strong><p>{detail}</p></div></li>)}</ol>
  </figure>
}
