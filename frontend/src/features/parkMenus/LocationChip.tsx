import { useEffect, useState } from 'react'
import { PARK_ZONES } from '../../config/parkLayout'
import { avatars, useSession } from '../../network/worldClient'
import { environmentFrame } from '../../world/environmentState'
import pinIcon from './icons/place-pin.svg'
import sunIcon from './icons/place-sun.svg'
import './parkMenus.css'

// Beyond this distance from every zone centre the chip names the paths in between.
const ZONE_RADIUS = 16

function placeName(x: number, z: number) {
  let best: { name: string; distance: number } | null = null
  for (const zone of PARK_ZONES) {
    const distance = Math.hypot(zone.x - x, zone.z - z)
    if (!best || distance < best.distance) best = { name: zone.name, distance }
  }
  return best && best.distance <= ZONE_RADIUS ? best.name : '공원 산책로'
}

/** Park clock (sampleDay) hour as the HUD's "해질녘 · 오후 5:40". */
export function timeLabel(hour: number) {
  const minutes = Math.floor(hour * 60) % (24 * 60)
  const h = Math.floor(minutes / 60), m = minutes % 60
  const period = h >= 5 && h < 7 ? '새벽' : h >= 7 && h < 11 ? '아침' : h >= 11 && h < 16 ? '낮' : h >= 16 && h < 19 ? '해질녘' : '밤'
  return `${period} · ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

/** Top-centre chip: nearest park zone and park time. Display only; no server call. */
export function LocationChip() {
  const own = useSession(s => s.sessionId)
  const [view, setView] = useState({ place: '', time: '' })
  useEffect(() => {
    const read = () => {
      const position = avatars.get(own)?.current
      const next = { place: position ? placeName(position.x, position.z) : '', time: timeLabel(environmentFrame.hour) }
      setView(old => old.place === next.place && old.time === next.time ? old : next)
    }
    read()
    const timer = setInterval(read, 1000)
    return () => clearInterval(timer)
  }, [own])
  return <section className="park-location-chip" aria-label="현재 위치와 공원 시간">
    {view.place && <><span className="park-location-chip__place"><img src={pinIcon} alt="" />{view.place}</span><i aria-hidden="true" /></>}
    <span className="park-location-chip__time"><img src={sunIcon} alt="" />{view.time}</span>
  </section>
}
