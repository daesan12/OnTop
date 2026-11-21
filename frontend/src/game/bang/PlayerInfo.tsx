import type { CSSProperties } from 'react'
import type { BangCard, BangPlayer, BangRole, BangCharacter } from './protocol'
import { CHARACTERS } from './protocol'
import { CHARACTER, CARD_NAME, ROLE_GOAL, ROLE_NAME, WEAPON_RANGE } from './presentation'
import { artStyle, ART_INDEX } from './BangCard'
import { CardHelp } from './CardHelp'

function Portrait({ character }: { character: BangCharacter }) {
  const index = CHARACTERS.indexOf(character)
  return <span className="bang-portrait" aria-hidden="true" style={{ backgroundImage: 'url(/art/bang/portraits-v1.webp)',
    backgroundSize: '400% 400%', backgroundPosition: `${index % 4 / 3 * 100}% ${Math.floor(index / 4) / 3 * 100}%` } as CSSProperties} />
}

export function weaponOf(player: BangPlayer) {
  return player.equipment.find(card => WEAPON_RANGE[card.kind] !== undefined)
}

export function PlayerInfo({ player, name, own = false, ownRole, distance, turn = false, pinged = false, onPing }: {
  player: BangPlayer; name: string; own?: boolean; ownRole?: BangRole; distance?: number; turn?: boolean; pinged?: boolean; onPing?(): void
}) {
  const role = own ? ownRole ?? player.role : player.role
  const weapon = weaponOf(player), equipment = player.equipment.filter(card => card !== weapon)
  const weaponArt = <span className="bang-weapon-art" style={artStyle(ART_INDEX[weapon?.kind ?? 'SCHOFIELD'])} aria-hidden="true" />
  const chip = (card: BangCard) => <CardHelp key={card.id} card={card} focusable><span className="bang-equipment-chip">{CARD_NAME[card.kind]}</span></CardHelp>
  return <article className={own ? 'bang-own-info' : 'bang-opponent'} data-active={player.active} data-turn={turn} data-ping={pinged} aria-label={`${name} 정보`}>
    {own && <h2>내 정보</h2>}
    <div className="bang-person"><Portrait character={player.character} /><div>
      <strong>{name}{!player.active && <em> · 탈락</em>}</strong>
      <span className="bang-role" data-role={role ?? 'HIDDEN'}>역할 · {role ? ROLE_NAME[role] : '비공개'}</span>
      <span className="bang-character">인물 · {CHARACTER[player.character][0]}</span>
    </div>{onPing && <button className="bang-ping-button" onClick={onPing} aria-label={`${name} 위치 표시`}>◎</button>}</div>
    {own && role && <div className="bang-goal"><b>승리 목표</b><p>{ROLE_GOAL[role]}</p></div>}
    <div className="bang-vitals"><span>생명력 <b>{Math.max(0, player.hp)} / {player.maxHp}</b></span>
      <span className="bang-hearts" aria-label={`생명력 ${Math.max(0, player.hp)} / ${player.maxHp}`}>{Array.from({ length: player.maxHp }, (_, i) => <i key={i} data-empty={i >= player.hp} aria-hidden="true">♥</i>)}</span>
      <span className="bang-hand-count">손패 <b>{player.cardCount}장</b></span></div>
    <p className="bang-ability"><b>능력</b> {CHARACTER[player.character][1]}</p>
    <div className="bang-weapon">{weapon ? <CardHelp card={weapon} focusable>{weaponArt}</CardHelp> : weaponArt}<div>
      <span>{own ? '장착 무기' : '무기'} · <b>{weapon ? CARD_NAME[weapon.kind] : '기본 권총'}</b></span>
      <span>공격 사거리 <b>{player.range}</b>{distance !== undefined && player.active && <small> · 나와의 거리 {distance}</small>}</span>
    </div></div>
    {(own || equipment.length > 0) && <div className="bang-equipment"><b>장비</b>{equipment.length ? equipment.map(chip) : <span>없음</span>}</div>}
    {pinged && <span className="bang-ping-label" role="status">관전자가 {own ? '나를' : '이 참가자를'} 가리켰어요</span>}
  </article>
}
