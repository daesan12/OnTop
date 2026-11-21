import { useEffect, useRef, useState } from 'react'
import { avatars, useSession, sampleAvatar, estimatedServerTime } from '../../network/worldClient'
import { panelOwnsKeys, textInputOwnsKeys, focusParkCanvas } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { MOVEMENT } from '../../config'
import { renewalGroundHeight } from '../../park/renewalMap'
import { carryPlayerAvailable } from '../carry/interaction'
import { useFacilityState } from '../facilities/state'
import { createCarryEscape, CARRY_ESCAPE_PRESSES } from '../carry/escape'
import { SNOW_PILES } from './plan'
import { CarryEscapeHint } from '../carry/CarryEscapeHint'
import { useSnowballAim } from './aimState'
import { useOntop } from '../ai/ontop'
import { useWinter, winterFrozen } from './state'
import './winter.css'
import { useWinterBoardView, winterSceneryVisible } from './presentation'

export function WinterHud() {
  const self = useSession(s => s.sessionId), player = useWinter(s => s.players[self]), notice = useWinter(s => s.notice)
  const sleigh = useFacilityState(s => s.occupancies[self]?.kind === 'SLEIGH')
  const boardView = useWinterBoardView()
  const motion = useWinter(s => s.motions[self]), aim = useSnowballAim(s => s.aim)
  const [ready, setReady] = useState(false)
  const [pileId, setPileId] = useState(''), [cooldown, setCooldown] = useState(false), [now, setNow] = useState(estimatedServerTime)
  const escape = useRef(createCarryEscape()), completed = useRef(false), queue = useRef(Promise.resolve())
  const gathering = motion?.kind === 'gather' && now - motion.at < 800
  const windingUp = motion?.kind === 'windup' && now - motion.at < 800
  const frozen = !!player?.freezeId && !!player.frozenUntil && Date.parse(player.frozenUntil) > now
  useEffect(() => { escape.current.reset(); completed.current = false }, [player?.freezeId])
  useEffect(() => {
    const timer = setInterval(() => {
      const session = useSession.getState(), own = avatars.get(session.sessionId)
      setNow(estimatedServerTime())
      setReady(winterSceneryVisible() && session.status === 'connected' && session.mapCompatible && !!own && !own.carry
        && carryPlayerAvailable(session.sessionId, own) && !own.vehicle && !session.pending && !panelOwnsKeys())
      setPileId(own ? SNOW_PILES.find(p => Math.hypot(own.current.x - p.x, own.current.z - p.z) <= p.radius
        && Math.abs(own.current.y - renewalGroundHeight(own.current.x, own.current.z) - MOVEMENT.halfHeight - MOVEMENT.radius - MOVEMENT.offset) <= .65)?.id ?? '' : '')
    }, 100)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 1300)
    return () => clearTimeout(timer)
  }, [cooldown])
  const act = () => {
    const session = useSession.getState(), own = avatars.get(session.sessionId)
    if (!winterSceneryVisible() || !ready || cooldown || gathering || windingUp || frozen || panelOwnsKeys() || !own || own.carry || session.pending) return
    if (!player?.snowballs) {
      if (pileId) void parkRuntime.pickupSnowball?.(pileId).then(() => focusParkCanvas())
      return
    }
    const pose = sampleAvatar(own, performance.now(), { x: 0, y: 0, z: 0, yaw: 0 })
    setCooldown(true)
    void parkRuntime.throwSnowball?.(Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw))).then(() => focusParkCanvas())
  }
  const pressEscape = (key: 'A' | 'D') => {
    if (!player?.freezeId || !frozen || completed.current || panelOwnsKeys()) return
    completed.current = escape.current.press(player.freezeId, key === 'A' ? 'KeyA' : 'KeyD', performance.now())
    const id = player.freezeId
    queue.current = queue.current.then(async () => {
      if (useWinter.getState().players[self]?.freezeId !== id || !winterFrozen(self, estimatedServerTime())) return
      // Queued key presses must retain an interval after the preceding server acknowledgement.
      await new Promise(resolve => setTimeout(resolve, 40))
      if (useWinter.getState().players[self]?.freezeId !== id || !winterFrozen(self, estimatedServerTime())) return
      const ok = await parkRuntime.escapeSnowball?.(id, key)
      if (!ok) { escape.current.reset(); completed.current = false }
    })
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!winterSceneryVisible() || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || textInputOwnsKeys(e.target) || panelOwnsKeys()) return
      if (frozen && (e.code === 'KeyA' || e.code === 'KeyD')) {
        e.preventDefault(); e.stopImmediatePropagation(); pressEscape(e.code === 'KeyA' ? 'A' : 'D'); return
      }
      if (e.code !== 'KeyQ' || !ready || cooldown || winterFrozen(self, estimatedServerTime())) return
      e.preventDefault(); act()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [ready, cooldown, gathering, windingUp, frozen, pileId, player, self])
  if (sleigh || boardView || !winterSceneryVisible() || !frozen && (!ready || !pileId && !player?.snowballs)) return null
  return <section className="winter-hud" aria-label="겨울 공원 눈싸움">
    {frozen ? <div className="winter-frozen" role="status">
      <strong>얼었어요! {Math.max(1, Math.ceil((Date.parse(player!.frozenUntil!) - now) / 1000))}초</strong>
      <CarryEscapeHint action="얼음 깨기" onPress={key => { pressEscape(key); focusParkCanvas() }} />
      <small>A·D 반복 입력 · {player?.escapePresses ?? 0} / {CARRY_ESCAPE_PRESSES}</small>
    </div> : <>
      <button type="button" aria-keyshortcuts="Q" disabled={!ready || cooldown || gathering || windingUp || !player?.snowballs && !pileId} onClick={act}>
        <kbd>Q</kbd> {gathering ? '눈 모아 뭉치는 중…' : windingUp ? '던지는 중…' : cooldown ? '다음 동작 준비 중…' : player?.snowballs ? '눈덩이 던지기' : '눈 줍기 · 뭉치기'}
      </button>
      {player?.snowballs === 1 && !gathering && <small role="status">{aim?.hitUserId ? `${aim.hitUserId === useOntop.getState().actor?.id ? '온탑' : avatars.get(aim.hitUserId)?.nickname ?? '상대'} 명중 예상 · ${aim.distance.toFixed(1)}m` : '캐릭터 정면의 표적으로 던져요'}</small>}
      {!!player?.hits && <small>피격 {player.hits} / 3 · 세 번 맞으면 얼어요</small>}
    </>}
    {!frozen && <span role="status">{notice}</span>}
  </section>
}
