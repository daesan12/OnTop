import { useId } from 'react'
import type { BangPlayer, BangRole } from './protocol'
import { CARD_NAME, ROLE_NAME } from './presentation'
import { Portrait, weaponOf } from './PlayerInfo'

/** 경기 중에는 비교에 필요한 수치만 표시하고 능력·장비 설명은 상세 창에서 읽는다. */
export function PlayerSummary({ player, name, own = false, ownRole, turn, pinged, targetable = false, targeted = false, distance, onDetails, onTarget }: {
  player: BangPlayer; name: string; own?: boolean; ownRole?: BangRole; turn: boolean; pinged: boolean
  targetable?: boolean; targeted?: boolean; distance?: number; onDetails(): void; onTarget?(): void
}) {
  const role = own ? ownRole ?? player.role : player.role
  const weapon = weaponOf(player)
  const id = useId()
  return <article className="bang-summary" data-own={own} data-turn={turn} data-active={player.active}
    data-ping={pinged} data-targetable={targetable} data-targeted={targeted}>
    <button className="bang-summary-main" onClick={targetable ? onTarget : onDetails}
      aria-label={targetable ? `${name} 대상 선택` : `${own ? '내 역할·능력' : `${name} 상세 정보`}`}
      aria-describedby={`${id}-person ${id}-health ${id}-weapon ${id}-extra`}
      aria-pressed={targetable ? targeted : undefined} aria-haspopup={targetable ? undefined : 'dialog'}>
      <Portrait character={player.character} />
      <span id={`${id}-person`} className="bang-summary-person"><strong>{name}{!player.active && ' · 탈락'}</strong>
        <span className="bang-role" data-role={role ?? 'HIDDEN'}>{role ? ROLE_NAME[role] : '비공개'}</span></span>
      <span id={`${id}-health`} className="bang-summary-health" aria-label={`생명력 ${Math.max(0, player.hp)} / ${player.maxHp}`}><i aria-hidden="true">♥</i> {Math.max(0, player.hp)} / {player.maxHp}</span>
      <span id={`${id}-weapon`} className="bang-summary-weapon">{weapon ? CARD_NAME[weapon.kind] : '기본 권총'} <span>· 사거리 {player.range}</span></span>
      <span id={`${id}-extra`} className="bang-summary-extra">{targetable ? targeted ? '선택됨' : `대상 선택 · 거리 ${distance ?? '—'}` : own ? '내 역할·능력 ›' : `손패 ${player.cardCount}장${player.equipment.length > (weapon ? 1 : 0) ? ' · 장비 있음' : ''}`}</span>
    </button>
    {targetable && <button className="bang-summary-details" onClick={onDetails} aria-label={`${name} 상세 정보`} aria-haspopup="dialog">상세</button>}
    {pinged && <span className="bang-summary-ping" role="status">관전자 표시</span>}
  </article>
}
