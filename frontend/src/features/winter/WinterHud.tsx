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
import { useWinter, winterFrozen } from './state'
import { MAX_SNOWBALLS } from './trajectory'
import './winter.css'
import { useWinterBoardView, winterSceneryVisible } from './presentation'
import { beginSnowPress, endSnowPress, useSnowRollInput } from './community/rollInput'
import { useWinterCommunity } from './community/state'

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
  const frozen = winterFrozen(self, now)
  const snowballs = player?.snowballs ?? 0
  const rolling = useSnowRollInput(s => s.phase), rollError = useSnowRollInput(s => s.error)
  const held = useWinterCommunity(s => s.building?.balls.find(ball => ball.pushing.includes(self)))
  const [nearBall, setNearBall] = useState(false)
  useEffect(() => () => endSnowPress(true), [])
  useEffect(() => { if (!ready || frozen || sleigh || boardView) endSnowPress(true) }, [ready, frozen, sleigh, boardView])
  useEffect(() => { escape.current.reset(); completed.current = false }, [player?.freezeId])
  useEffect(() => {
    const timer = setInterval(() => {
      const session = useSession.getState(), own = avatars.get(session.sessionId)
      setNow(estimatedServerTime())
      setReady(winterSceneryVisible() && session.status === 'connected' && session.mapCompatible && !!own && !own.carry
        && carryPlayerAvailable(session.sessionId, own) && !own.vehicle && !session.pending && !panelOwnsKeys())
      setPileId(own ? SNOW_PILES.find(p => Math.hypot(own.current.x - p.x, own.current.z - p.z) <= p.radius
        && Math.abs(own.current.y - renewalGroundHeight(own.current.x, own.current.z) - MOVEMENT.halfHeight - MOVEMENT.radius - MOVEMENT.offset) <= .65)?.id ?? '' : '')
      setNearBall(!!own && !!useWinterCommunity.getState().building?.balls.some(ball => !ball.reserved
        && Math.hypot(ball.x - own.current.x, ball.z - own.current.z) <= ball.radius + 2.2))
    }, 100)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 1300)
    return () => clearTimeout(timer)
  }, [cooldown])
  const act = (throwing = false) => {
    const session = useSession.getState(), own = avatars.get(session.sessionId)
    if (useSnowRollInput.getState().phase !== 'idle' || useWinterCommunity.getState().building?.balls.some(ball => ball.pushing.includes(session.sessionId))) return
    if (!winterSceneryVisible() || !ready || cooldown || gathering || windingUp || frozen || panelOwnsKeys() || !own || own.carry || session.pending) return
    if (!throwing && pileId && snowballs < MAX_SNOWBALLS) {
      void parkRuntime.pickupSnowball?.(pileId).then(() => focusParkCanvas())
      return
    }
    if (!snowballs) return
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
      if (!['KeyQ', 'KeyR'].includes(e.code) || !ready || cooldown || winterFrozen(self, estimatedServerTime())) return
      if (!pileId && !nearBall && !snowballs) return
      e.preventDefault()
      if (e.code === 'KeyQ') beginSnowPress(() => act())
      else act(true)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'KeyQ') { e.preventDefault(); endSnowPress() } }
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', up, true) }
  }, [ready, cooldown, gathering, windingUp, frozen, pileId, player, self, nearBall, snowballs])
  if (sleigh || boardView || !winterSceneryVisible() || !frozen && (!ready || !pileId && !player?.snowballs && !nearBall && !held && rolling === 'idle')) return null
  return <section className="winter-hud" aria-label="겨울 공원 눈싸움">
    {frozen ? <div className="winter-frozen" role="status">
      <strong>얼었어요! {Math.max(1, Math.ceil((Date.parse(player!.frozenUntil!) - now) / 1000))}초</strong>
      <CarryEscapeHint action="얼음 깨기" onPress={key => { pressEscape(key); focusParkCanvas() }} />
      <small>A·D 반복 입력 · {player?.escapePresses ?? 0} / {CARRY_ESCAPE_PRESSES}</small>
    </div> : <>
      <div className="winter-hud__actions"><button type="button" aria-keyshortcuts="Q" disabled={!ready || cooldown || gathering || windingUp}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginSnowPress(() => act()) }}
        onPointerUp={() => endSnowPress()} onPointerCancel={() => endSnowPress(true)} onContextMenu={event => event.preventDefault()}
        onClick={event => { event.preventDefault(); if (!event.detail) act() }}>
        <kbd>Q</kbd> {held ? '누른 채 이동 · 놓으면 눈 내려놓기' : rolling === 'starting' ? '눈 굴리기 준비 중…' : rolling === 'pressing' ? '꾹 눌러 눈 모으는 중…' : gathering ? '눈 모아 뭉치는 중…' : windingUp ? '던지는 중…' : cooldown ? '다음 동작 준비 중…' : pileId ? snowballs < MAX_SNOWBALLS ? '짧게 눈 줍기 · 꾹 눌러 굴리기' : '짧게 던지기 · 꾹 눌러 굴리기' : nearBall ? '꾹 눌러 함께 굴리기' : '짧게 눈덩이 던지기'}
      </button>
      {!!pileId && <button type="button" aria-keyshortcuts="R" disabled={!ready || cooldown || gathering || windingUp || !snowballs || !!held || rolling !== 'idle'} onClick={() => act(true)}><kbd>R</kbd> 눈덩이 던지기</button>}</div>
      {held && <small role="status">굴리는 눈 지름 {(held.radius * 2).toFixed(2)} / 2.20m · 함께 {held.pushing.length}명</small>}
      <small>눈덩이 세 개를 모아 광장 양옆 눈밭에서 E로 눈사람을 만들어요.</small>
      {!!rollError && <small role="alert">{rollError}</small>}
      <small className="winter-hud__stock" role="status">눈덩이 {snowballs} / {MAX_SNOWBALLS}</small>
      {snowballs > 0 && !gathering && <small role="status">{aim?.hitUserId ? `${avatars.get(aim.hitUserId)?.nickname ?? '상대'} 명중 예상 · ${aim.distance.toFixed(1)}m` : '캐릭터 정면의 표적으로 던져요'}</small>}
      {!!player?.hits && <small>피격 {player.hits} / 3 · 세 번 맞으면 얼어요</small>}
    </>}
    {!frozen && <span role="status">{notice}</span>}
  </section>
}
