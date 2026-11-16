import { useEffect, useState } from 'react'
import { avatars, estimatedServerTime, useSession } from '../../network/worldClient'
import { DUCK_BOAT } from '../../park/mapConfig'
import { displayNickname } from '../gameMaster/displayName'
import { facilityInRange, useFacilityState } from '../facilities/state'
import { boatPartners, inviteBoatPartner, joinDuckBoat, leaveDuckBoat, replyBoatInvite, rideBoatAlone } from './controller'
import { boatPlacement, closeBoatChooser, useDuckBoat } from './model'
import './duckBoat.css'

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000))

function useNow(active: boolean) {
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(estimatedServerTime()), 250)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function useNickname() {
  const profiles = useSession(s => s.profiles)
  return (id: string | null | undefined) => id ? displayNickname(profiles[id], avatars.get(id)?.nickname || '산책자 ' + id.slice(-6)) : ''
}

/** Same-channel players, nearest first, refreshed while the list is open. */
function PartnerList({ onPick, pending }: { onPick: (id: string) => void; pending: boolean }) {
  const name = useNickname()
  const [partners, setPartners] = useState(boatPartners)
  useEffect(() => {
    const timer = setInterval(() => setPartners(boatPartners()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!partners.length) return <p className="duck-boat-empty">함께 탈 수 있는 사람이 근처에 없어요.</p>
  return <ul className="duck-boat-partners" aria-label="함께 탈 사람">
    {partners.map(p => <li key={p.userId}>
      <button type="button" disabled={pending} onClick={() => onPick(p.userId)}>
        <span>{name(p.userId)}</span><small>{Math.round(p.distance)}m</small>
      </button>
    </li>)}
  </ul>
}

/** Dock menu: ride alone, or pick a partner to invite. */
function Chooser() {
  const { pending, picking, error } = useDuckBoat()
  const fare = useFacilityState(s => s.boats?.fare ?? 30)
  useEffect(() => {
    const away = setInterval(() => {
      const { sessionId } = useSession.getState(), pose = avatars.get(sessionId)?.current
      if (!DUCK_BOAT || !pose || facilityInRange(pose, DUCK_BOAT.id) === false) closeBoatChooser()
    }, 300)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeBoatChooser() }
    window.addEventListener('keydown', escape)
    return () => { clearInterval(away); window.removeEventListener('keydown', escape) }
  }, [])
  return <aside className="duck-boat-panel" aria-label="오리배 타기">
    <div className="duck-boat-controls">
      <div><strong>오리배 타기</strong><p>한 바퀴 1분 · 1인 {fare}냥 · 출발할 때 내요</p></div>
      <button type="button" onClick={closeBoatChooser}>닫기</button>
    </div>
    {picking ? <>
      <p className="duck-boat-hint">함께 탈 사람을 고르면 초대를 보내요. 10초 안에 수락하면 옆 자리로 와요.</p>
      <PartnerList pending={pending} onPick={id => void joinDuckBoat(id)} />
      <div className="duck-boat-actions"><button type="button" onClick={() => useDuckBoat.setState({ picking: false })}>뒤로</button></div>
    </> : <div className="duck-boat-actions">
      <button type="button" disabled={pending} onClick={() => void joinDuckBoat()}>혼자 타기</button>
      <button type="button" disabled={pending} onClick={() => useDuckBoat.setState({ picking: true })}>둘이서 타기</button>
    </div>}
    {error && <div role="alert">{error}</div>}
  </aside>
}

/** Invitations received by this player, wherever they are. */
function Invites() {
  const invites = useDuckBoat(s => s.invites)
  const pending = useDuckBoat(s => s.pending)
  const name = useNickname()
  const now = useNow(invites.length > 0)
  const live = invites.filter(i => i.expiresAt > now)
  useEffect(() => {
    if (live.length !== invites.length) useDuckBoat.setState(s => ({ invites: s.invites.filter(i => i.expiresAt > estimatedServerTime()) }))
  }, [live.length, invites.length])
  if (!live.length) return null
  return <div className="duck-boat-invites">
    {live.map(invite => <aside key={invite.inviterId} className="duck-boat-invite" role="alertdialog" aria-label="오리배 초대">
      <p><strong>{name(invite.inviterId)}</strong> 님이 오리배를 같이 타자고 해요.</p>
      <small>수락하면 선착장으로 이동해요 · 출발할 때 {invite.fare}냥 · {seconds(invite.expiresAt - now)}초</small>
      <div className="duck-boat-actions">
        <button type="button" disabled={pending} onClick={() => void replyBoatInvite(invite.inviterId, true)}>수락</button>
        <button type="button" disabled={pending} onClick={() => void replyBoatInvite(invite.inviterId, false)}>거절</button>
      </div>
    </aside>)}
  </div>
}

/** Waiting (invite, choice or countdown) with cancel, or the remaining ride with get-off. */
function Status() {
  const userId = useSession(s => s.sessionId)
  const lease = useFacilityState(s => s.occupancies[userId])
  const boats = useFacilityState(s => s.boats)
  const { pending, error, notice, picking } = useDuckBoat()
  const name = useNickname()
  const placement = boatPlacement(lease, boats)
  const now = useNow(!!placement)
  if (!placement) return null
  const fare = boats?.fare ?? 0
  const leave = <button type="button" disabled={pending} onClick={event => { void leaveDuckBoat(); event.currentTarget.blur() }}>
    {placement.phase === 'queue' ? '대기 취소' : '내리기'}
  </button>
  let title = '오리배 운항 중', detail = '', choices = null
  if (placement.phase === 'riding') {
    detail = `선착장 도착까지 ${seconds(placement.departedAt + (boats?.lapMillis ?? 0) - now)}초`
  } else {
    const team = placement.team, mate = team?.members.find(m => m && m !== userId)
    if (team?.phase === 'INVITING') {
      title = '초대 응답을 기다리는 중'
      detail = `${name(team.partnerId)} 님에게 초대를 보냈어요 · ${seconds((team.deadline ?? now) - now)}초`
    } else if (team?.phase === 'CHOOSING') {
      title = '함께 타지 못했어요'
      detail = `${seconds((team.deadline ?? now) - now)}초 안에 골라주세요 · 고르지 않으면 대기를 마쳐요`
      choices = picking ? <PartnerList pending={pending} onPick={id => void inviteBoatPartner(id)} />
        : <div className="duck-boat-actions">
          <button type="button" disabled={pending} onClick={() => void rideBoatAlone()}>혼자 타기</button>
          <button type="button" disabled={pending} onClick={() => useDuckBoat.setState({ picking: true })}>다른 사람 초대</button>
        </div>
    } else {
      title = mate ? `${name(mate)} 님과 오리배 대기 중` : '오리배 대기 중'
      const left = team?.departAt == null ? null : seconds(team.departAt - now)
      detail = left === null ? '출발 시각을 확인하고 있어요.' : left > 0 ? `출발까지 ${left}초 · 탑승할 때 ${fare}냥` : `곧 출발해요 · 탑승할 때 ${fare}냥`
    }
  }
  return <aside className="duck-boat-panel" aria-label="오리배">
    <div className="duck-boat-controls">
      <div><strong>{title}</strong><p>{detail}</p></div>
      {leave}
    </div>
    {choices}
    {notice && <span role="status">{notice}</span>}
    {error && <div role="alert">{error}</div>}
  </aside>
}

export function DuckBoatPanel() {
  const userId = useSession(s => s.sessionId)
  const leased = useFacilityState(s => s.occupancies[userId]?.kind === 'BOAT')
  const { chooser, notice, error } = useDuckBoat()
  return <>
    <Invites />
    {leased ? <Status /> : chooser ? <Chooser /> : (notice || error) && <aside className="duck-boat-toast" role="status">{notice || error}
      {error && <button type="button" onClick={() => useDuckBoat.setState({ error: '' })}>닫기</button>}</aside>}
  </>
}
