import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import pen from './art/fountain-pen.webp'

/** A real textarea keeps Korean IME, selection, paste, accessibility and maxlength native. */
export function FountainPenInput({ value, pending, onChange }: {
  value: string; pending: boolean; onChange: (value: string) => void
}) {
  const area = useRef<HTMLTextAreaElement>(null), mirror = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null), idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const frame = useRef(0)
  const [tip, setTip] = useState({ x: 18, y: 31, visible: false }), [writing, setWriting] = useState(false)
  const measure = () => {
    const el = area.current, copy = mirror.current, caret = marker.current
    if (!el || !copy || !caret) return
    const style = getComputedStyle(el)
    for (const key of ['font', 'letterSpacing', 'lineHeight', 'padding', 'borderWidth', 'boxSizing', 'tabSize'] as const) copy.style[key] = style[key]
    copy.style.width = el.clientWidth + 'px'
    copy.replaceChildren(document.createTextNode(el.value.slice(0, el.selectionStart)), caret)
    caret.textContent = el.value.slice(el.selectionStart) || '\u200b'
    const x = caret.offsetLeft - el.scrollLeft, y = caret.offsetTop - el.scrollTop + parseFloat(style.lineHeight) * .82
    setTip({ x, y, visible: document.activeElement === el && y > 8 && y < el.clientHeight - 5 })
  }
  const schedule = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(measure) }
  useLayoutEffect(measure, [value])
  useEffect(() => {
    const observer = new ResizeObserver(schedule)
    if (area.current) observer.observe(area.current)
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); clearTimeout(idle.current) }
  }, [])
  return <div className="notes-inkwell">
    <textarea ref={area} id="anonymous-note-text" aria-label="새 메모" value={value} readOnly={pending}
      maxLength={300} rows={6} placeholder="오늘도 좋은 하루 보내세요!" autoFocus
      aria-describedby="notes-length notes-result" onChange={event => {
        onChange(event.target.value); setWriting(true); clearTimeout(idle.current)
        idle.current = setTimeout(() => setWriting(false), 220); schedule()
      }} onSelect={schedule} onScroll={schedule} onFocus={schedule}
      onBlur={() => setTip(t => ({ ...t, visible: false }))} onCompositionUpdate={schedule} onCompositionEnd={schedule}/>
    <div ref={mirror} className="notes-caret-mirror" aria-hidden="true"><span ref={marker}/></div>
    <img className={`notes-fountain-pen${writing ? ' is-writing' : ''}`} src={pen} alt="" aria-hidden="true"
      style={{ left: tip.x, top: tip.y, opacity: tip.visible && value.length > 0 && !pending ? 1 : 0 }}/>
  </div>
}
