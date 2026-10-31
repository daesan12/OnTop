import { useEffect } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { effectsOutput } from '../../audio/bgm'
import { playSfx } from '../../audio/sfx'
import { playJumpSound } from './audio'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { STATUS_PATH, TIPS_PATH, COURSE, blockAtFeet, kstDate, START } from './course'
import { parseJumpStatus, type TipKey } from './protocol'
import { anticipateGate, applyJumpStatus, bindJumpmap, onStep, presentStep, showTip, standing, useJumpmap } from './state'

/** One read model per admitted player/channel. No client start, gate, finish or reward command. */
export function useJumpmapController() {
  const runtime = useParkRuntime()
  const owner = useSession(s => s.sessionId), channel = useSession(s => s.roomId)
  const map = useSession(s => s.mapVersion), verified = useSession(s => s.mapContractStatus === 'verified' && s.mapCompatible && s.status === 'connected')
  useEffect(() => {
    if (!GENERATED_PARK_ENABLED || !owner || !channel || !verified) return
    bindJumpmap(owner, channel, map)
    let disposed = false, loading = false, reloadAt = 0, previousFeet = NaN, previousBlock = -1
    const abort = new AbortController(), pendingTips = new Set<TipKey>()
    const inScope = () => !disposed && useSession.getState().sessionId === owner && useSession.getState().roomId === channel && useSession.getState().mapVersion === map
    async function load() {
      if (!inScope() || loading || document.hidden) return
      loading = true; reloadAt = performance.now() + 30_000
      try {
        const response = await runtime.requestJSON(`${STATUS_PATH}?channelId=${encodeURIComponent(channel)}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) })
        if (inScope()) applyJumpStatus(parseJumpStatus(response))
      } catch {
        if (inScope()) useJumpmap.setState({ checked: true, todayEarned: null, error: '점프맵 연결을 준비하고 있어요. 잠시 후 다시 확인할게요.' })
      } finally { loading = false }
    }
    const tip = (key: TipKey) => { if (!document.hidden && showTip(key)) pendingTips.add(key) }
    async function saveTips() {
      if (!pendingTips.size || document.hidden) return
      const tips = [...pendingTips]; tips.forEach(t => pendingTips.delete(t))
      try { await runtime.requestJSON(TIPS_PATH, { method: 'POST', body: JSON.stringify({ tips }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) }) }
      catch { if (inScope()) tips.forEach(t => pendingTips.add(t)) }
    }
    const stop = useJumpmap.subscribe((s, before) => {
      if (!inScope()) return
      if (s.walletRevision > before.walletRevision) refreshWalletAfterSettlement(owner, `jumpmap:${channel}:${s.revision}`)
      if (s.refresh !== before.refresh && performance.now() >= reloadAt) void load()
      if (s.run && s.run.runId !== before.run?.runId) { tip('RUN_STARTED'); if (!document.hidden) playSfx('game-start') }
      if (s.run && s.run.gatesPassed > (before.run?.gatesPassed ?? 0)) tip('FIRST_GATE')
      if (s.run?.finalReached && !before.run?.finalReached) tip('FINAL_PAD')
      if (s.result && s.result.runId !== before.result?.runId && s.result.reason !== 'FINISH' && !s.result.recovered) tip('FIRST_FALL')
      if (!document.hidden && s.result && !s.result.recovered && s.result.runId !== before.result?.runId) playSfx(s.result.reason === 'FINISH' || s.result.reason === 'LAKE' ? 'move-splash' : 'move-land')
    })
    const stopSound = onStep((block, player, power) => {
      if (!inScope() || document.hidden) return
      const own = avatars.get(owner), p = COURSE[block], output = effectsOutput()
      if (!own || !p || !output) return
      const pose = sampleAvatar(own, performance.now(), { ...own.current })
      const distance = Math.hypot(p.x - pose.x, p.top - (pose.y - .8), p.z - pose.z)
      if (player !== owner && distance >= 15) return
      playJumpSound({ id: 0, pad: { ...p, stage: p.stage - 1 }, time: performance.now(), kind: 'land' },
        { output, remote: player !== owner, level: power * (player === owner ? 1 : .5 * (1 - distance / 15)), pan: Math.max(-1, Math.min(1, ((p.x - pose.x) * Math.cos(pose.yaw) - (p.z - pose.z) * Math.sin(pose.yaw)) / 10)) })
    })
    const tick = () => {
      if (!inScope() || document.hidden) return
      const now = performance.now(), s = useJumpmap.getState()
      if (s.earningsDate && s.earningsDate !== kstDate()) { useJumpmap.setState({ earningsDate: kstDate(), todayEarned: null }); reloadAt = 0 }
      if (now >= reloadAt) { void load(); void saveTips() }
      if (!s.available) return
      const own = avatars.get(owner)
      if (!own) return
      const pose = sampleAvatar(own, now, { ...own.current }), feet = pose.y - .8
      if (!s.run && Math.hypot(pose.x - START.x, pose.z - START.z) < 3 && Math.abs(feet - START.y) < 2) tip('START_SPOT')
      const pad = !own.tableId && !own.benchId && !own.fitnessId && !own.telescopeId ? blockAtFeet({ ...pose, y: feet }) : undefined
      if (previousBlock >= 0 && pad?.block !== previousBlock && COURSE[previousBlock]?.theme === 'kite') {
        const output = effectsOutput(), p = COURSE[previousBlock]!
        if (output) playJumpSound({ id: 0, pad: { ...p, stage: p.stage - 1 }, time: now, kind: 'leave' }, { output, level: .5 })
      }
      if (pad && pad.block !== previousBlock && Number.isFinite(previousFeet) && previousFeet >= feet - .02) {
        presentStep(pad.block, owner, 1, now)
        if (pad.gate) anticipateGate(pad.gate, now)
      }
      previousFeet = feet; previousBlock = pad?.block ?? -1
      if (pad) standing.set(owner, pad.block); else standing.delete(owner)
      for (const [id, block] of standing) {
        if (id === owner) continue
        const other = avatars.get(id), b = COURSE[block]
        if (!other || !b || Math.abs(other.current.y - .8 - b.top) > .3 || Math.hypot(other.current.x - b.x, other.current.z - b.z) > Math.max(b.halfX, b.halfZ) + .5) standing.delete(id)
      }
    }
    void load()
    const timer = setInterval(tick, 50), tipTimer = setInterval(() => { void saveTips() }, 5000)
    const visible = () => { if (!document.hidden) { reloadAt = 0; tick(); if (useJumpmap.getState().run) tip('RUN_STARTED') } }
    document.addEventListener('visibilitychange', visible)
    return () => { disposed = true; abort.abort(); clearInterval(timer); clearInterval(tipTimer); stop(); stopSound(); standing.clear(); document.removeEventListener('visibilitychange', visible) }
  }, [runtime, owner, channel, map, verified])
}
