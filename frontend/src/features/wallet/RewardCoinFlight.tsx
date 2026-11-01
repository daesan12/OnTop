import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { useSession } from '../../network/worldClient'
import { useGame } from '../../game/store'
import { RewardFlightLedger, rewardCoinPose, type CoinPoint } from './rewardFlight'
import './rewardCoinFlight.css'
import { playSfx } from '../../audio/sfx'

interface Flight { owner: string; room: string; receipt: string; amount: number; from: CoinPoint }
const useFlight = create(() => ({ current: null as Flight | null }))
const ledger = new RewardFlightLedger()
const walletIcon = () => document.querySelector<HTMLElement>('[data-wallet-coin-target]')
function center(node: HTMLElement | null) {
  if (!node?.isConnected) return null
  const r = node.getBoundingClientRect()
  if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null
  return { x: Math.max(14, Math.min(innerWidth - 14, r.x + r.width / 2)), y: Math.max(14, Math.min(innerHeight - 14, r.y + r.height / 2)) }
}

/** Attach only to a displayed, server-confirmed positive payout. Reopening cannot replay it. */
export function RewardCoinSource({ receipt, amount, children, soundOnReveal = false }: { receipt: string; amount: number; children: ReactNode; soundOnReveal?: boolean }) {
  const source = useRef<HTMLSpanElement>(null)
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected'), room = useSession(s => s.roomId)
  useEffect(() => {
    if (!receipt || !Number.isSafeInteger(amount) || amount <= 0 || !owner || !connected) return
    let frame = 0, visible = false, done = false, sounded = false
    const attempt = () => {
      frame = 0
      if (done || !visible || document.hidden) return
      const from = center(source.current), to = center(walletIcon())
      // 미니게임은 결과 화면에서 공원 지갑을 숨겨도 지급 문구가 보이면 소리를 낸다.
      if (from && soundOnReveal && !sounded) {
        sounded = true
        if (ledger.claim(owner, `sound:${receipt}`, amount)) playSfx('coin-gain')
      }
      if (!from || !to) return
      done = true
      if (ledger.claim(owner, receipt, amount)) useFlight.setState({ current: { owner, room, receipt, amount, from } })
      observer.disconnect()
    }
    const schedule = () => { if (!frame && !done) frame = requestAnimationFrame(attempt) }
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); schedule() })
    if (source.current) observer.observe(source.current)
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => { done = true; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); document.removeEventListener('visibilitychange', schedule) }
  }, [receipt, amount, owner, connected, room, soundOnReveal])
  return <span ref={source} data-reward-coin-source={receipt || undefined}>{children}</span>
}

export function BoardRewardCoinSource({ children }: { children: ReactNode }) {
  const own = useSession(s => s.sessionId)
  const result = useGame(s => {
    if (s.watchedGameId || s.game?.role === 'SPECTATOR') return null
    const id = s.permittedGameId || s.completedGameId
    return s.result?.gameSessionId === id ? s.result : s.lastResult?.gameSessionId === id ? s.lastResult : null
  })
  const amount = result?.status === 'FINISHED' && result.settlementStatus === 'SETTLED'
    && result.participants.some(p => p.userId === own) ? result.myCoinDelta ?? 0 : 0
  return <RewardCoinSource receipt={result ? `board:${result.gameSessionId}` : ''} amount={amount}>{children}</RewardCoinSource>
}

/** One lightweight portal; frames update transforms directly, with no React render per coin/frame. */
export function RewardCoinFlight() {
  const current = useFlight(s => s.current), root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!current || !root.current) return
    const node = root.current, coins = [...node.querySelectorAll<HTMLElement>('.reward-coin-flight__coin')]
    const halo = node.querySelector<HTMLElement>('.reward-coin-flight__arrival')!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, started: number | null = null
    const stop = () => {
      cancelAnimationFrame(frame)
      if (useFlight.getState().current === current) useFlight.setState({ current: null })
    }
    const valid = () => {
      const s = useSession.getState()
      return s.sessionId === current.owner && s.roomId === current.room && s.status === 'connected' && !document.hidden
    }
    const tick = (at: number) => {
      const to = center(walletIcon())
      if (!valid() || !to) { stop(); return }
      started ??= at
      const elapsed = at - started, reduced = media.matches
      node.dataset.motion = reduced ? 'reduced' : 'full'
      coins.forEach((coin, index) => {
        const p = rewardCoinPose(current.from, to, elapsed, index)
        coin.style.transform = `translate3d(${p.x - 17}px,${p.y - 17}px,0) rotate(${p.rotation}deg) scale(${p.scale})`
        coin.style.opacity = reduced ? '0' : String(p.opacity)
      })
      const arrived = reduced || elapsed >= 1000
      halo.style.transform = `translate3d(${to.x}px,${to.y}px,0)`
      halo.dataset.visible = String(arrived)
      node.dataset.arrived = String(arrived)
      if (elapsed >= (reduced ? 850 : 1600)) { stop(); return }
      frame = requestAnimationFrame(tick)
    }
    const unsubscribe = useSession.subscribe(() => { if (!valid()) stop() })
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', visibility)
    frame = requestAnimationFrame(tick)
    return () => { stop(); unsubscribe(); document.removeEventListener('visibilitychange', visibility) }
  }, [current])
  if (!current) return null
  return createPortal(<div ref={root} key={`${current.owner}/${current.receipt}`} className="reward-coin-flight" aria-hidden="true" data-receipt={current.receipt}>
    {Array.from({ length: 8 }, (_, i) => <img key={i} className="reward-coin-flight__coin" src={coinImage} alt="" draggable={false} />)}
    <div className="reward-coin-flight__arrival" data-visible="false"><span className="reward-coin-flight__ring" /><b>+{current.amount.toLocaleString('ko-KR')}냥</b></div>
  </div>, document.body)
}
