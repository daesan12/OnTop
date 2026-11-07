import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadNotices, noticeRefreshDelay, visibleNotices, type NoticeFeed } from './api'
import './announcements.css'
import { useGachaEvents } from '../gacha/events'

export function AnnouncementBanner({ hidden = false }: { hidden?: boolean }) {
  const systemNotices = useGachaEvents(s => s.notices)
  const [feed, setFeed] = useState<NoticeFeed | null>(null), [age, setAge] = useState(0)
  const received = useRef(0), [index, setIndex] = useState(0)
  const [duration, setDuration] = useState(16), [width, setWidth] = useState(600), viewport = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>, request: AbortController | null = null, serial = 0
    const refresh = async () => {
      const turn = ++serial; request?.abort(); clearTimeout(timer)
      request = new AbortController()
      try {
        const feed = await loadNotices(request.signal)
        if (stopped || turn !== serial) return
        received.current = performance.now(); setFeed(feed); setAge(0)
        timer = setTimeout(() => void refresh(), noticeRefreshDelay(feed))
      } catch {
        if (!stopped && turn === serial) timer = setTimeout(() => void refresh(), 10000)
      }
    }
    const foreground = () => { if (!document.hidden) void refresh() }
    void refresh(); document.addEventListener('visibilitychange', foreground)
    const clock = setInterval(() => setAge(performance.now() - received.current), 1000)
    return () => { stopped = true; request?.abort(); clearTimeout(timer); clearInterval(clock); document.removeEventListener('visibilitychange', foreground) }
  }, [])
  const values = [...systemNotices.filter(n => n.expiresAt > performance.now()),
    ...(feed && age < 30000 ? visibleNotices(feed, age) : [])]
  const active = values[index % (values.length || 1)]
  const signature = values.map(value => `${value.id}:${value.version}`).join('/')
  useEffect(() => { setIndex(0) }, [signature])
  useEffect(() => {
    const measure = () => { const width = viewport.current?.clientWidth ?? 600; setWidth(width)
      setDuration(Math.max(12, (width + (text.current?.scrollWidth ?? 600)) / 45)) }
    measure(); const observer = new ResizeObserver(measure)
    if (viewport.current) observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [active?.id, active?.version, hidden])
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex(i => i + 1), 8000)
    return () => clearInterval(timer)
  }, [signature])
  if (hidden || !active) return null
  return <aside className="announcement-banner" aria-label="공원 공지" style={{ '--notice-duration': `${duration}s`, '--notice-width': `${width}px` } as CSSProperties}>
    <div className="announcement-content">
      <strong>공지</strong><span className="announcement-window" ref={viewport}>
        <span ref={text} className="announcement-moving" key={`${active.id}:${active.version}:${index}`}
          onAnimationEnd={() => setIndex(i => i + 1)}>{active.text}</span>
      </span>
    </div>
  </aside>
}
