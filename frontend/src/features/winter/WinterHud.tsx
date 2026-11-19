import { useEffect, useState } from 'react'
import { avatars, useSession, sampleAvatar } from '../../network/worldClient'
import { panelOwnsKeys, textInputOwnsKeys } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { carryPlayerAvailable } from '../carry/interaction'
import { SANTA } from './plan'
import { useWinter } from './state'
import './winter.css'

export function WinterHud() {
  const notice = useWinter(s => s.notice), [ready, setReady] = useState(false), [nearSanta, setNearSanta] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => {
      const session = useSession.getState(), own = avatars.get(session.sessionId)
      setReady(session.status === 'connected' && session.mapCompatible && !!own && !own.carry
        && carryPlayerAvailable(session.sessionId, own) && !own.vehicle && !session.pending && !panelOwnsKeys())
      setNearSanta(!!own && Math.hypot(own.current.x - SANTA.x, own.current.z - SANTA.z) < 5)
    }, 150)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const throwSnowball = () => {
    const session = useSession.getState(), own = avatars.get(session.sessionId)
    if (!ready || cooldown || panelOwnsKeys() || !own || own.carry || session.pending) return
    const pose = sampleAvatar(own, performance.now(), { x: 0, y: 0, z: 0, yaw: 0 })
    setCooldown(true)
    void parkRuntime.throwSnowball?.(Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)))
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ' || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey
        || textInputOwnsKeys(e.target) || panelOwnsKeys() || !ready || cooldown) return
      e.preventDefault(); throwSnowball()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [ready, cooldown])
  return <aside className="winter-hud" aria-label="겨울 공원 눈싸움">
    <button type="button" disabled={!ready || cooldown} onClick={throwSnowball}>
      <kbd>Q</kbd> {cooldown ? '눈 뭉치는 중…' : '눈덩이 던지기'}
    </button>
    <small>캐릭터가 바라보는 방향으로 던져요</small>
    {nearSanta && <p>산타: 호호호! 메리 크리스마스! 친구와 눈싸움을 즐겨 보렴.</p>}
    <span role="status">{notice}</span>
  </aside>
}
