import './cards.css'
import { useState, type CSSProperties } from 'react'
import wall from './assets/cards/wall.webp'
import relocate from './assets/cards/relocate.webp'
import powerUp from './assets/cards/power-up.webp'
import grow from './assets/cards/grow.webp'
import shrink from './assets/cards/shrink.webp'
import extraShot from './assets/cards/extra-shot.webp'
import swap from './assets/cards/swap.webp'
import defend from './assets/cards/defend.webp'

const images: Record<string, string> = { WALL: wall, RELOCATE: relocate, POWER_UP: powerUp, GROW: grow, SHRINK: shrink, EXTRA_SHOT: extraShot, SWAP: swap, DEFEND: defend }

const artwork: Record<string, { name: string; caption: string; color: string; path: string }> = {
  WALL: { name: '벽 설치', caption: '길을 막고 · 궤도를 바꾸다', color: '#8b5833', path: 'M12 19h40v28H12z M12 29h40 M12 38h40 M25 19v10 M40 19v10 M19 29v9 M35 29v9 M27 38v9' },
  RELOCATE: { name: '알 재배치', caption: '한 알을 · 새로운 자리로', color: '#477b71', path: 'M11 43a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M37 20a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M18 29V18h16 M28 12l6 6-6 6' },
  POWER_UP: { name: '힘 강화', caption: '선택한 내 알 · 이번 판 내내 강화', color: '#ac4e27', path: 'M35 9L18 34h13l-3 21 19-29H34z M12 15l4 5 M49 46l4 5 M9 37h6 M49 15h6' },
  GROW: { name: '크기 확대', caption: '커진 몸집 · 묵직한 존재감', color: '#7d5b8d', path: 'M24 24h16v16H24z M10 24V10h14 M10 10l11 11 M40 10h14v14 M54 10L43 21 M54 40v14H40 M54 54L43 43 M24 54H10V40 M10 54l11-11' },
  SHRINK: { name: '크기 축소', caption: '작은 몸집 · 달라지는 틈새', color: '#427e86', path: 'M27 27h10v10H27z M10 10l13 13 M13 23h10V13 M54 10L41 23 M41 13v10h10 M54 54L41 41 M51 41H41v10 M10 54l13-13 M23 51V41H13' },
  EXTRA_SHOT: { name: '한 번 더 튕기기', caption: '같은 턴 안에 · 한 번 더', color: '#a1782e', path: 'M14 26a19 19 0 1 1 1 16 M8 18l6 8 9-5 M28 24h5v19 M26 43h13 M46 15l4-5 M52 23l6-1' },
  SWAP: { name: '알 위치 교환', caption: '두 알의 자리 · 판세의 반전', color: '#4f6b95', path: 'M11 21h39 M43 14l7 7-7 7 M53 43H14 M21 36l-7 7 7 7 M14 34a6 6 0 1 0 0-12a6 6 0 1 0 0 12 M50 30a6 6 0 1 0 0 12a6 6 0 1 0 0-12' },
  DEFEND: { name: '방어 자세', caption: '선택한 내 알 · 이번 판 내내 방어', color: '#3e7790', path: 'M32 9l19 7v15c0 11-9 19-19 24-10-5-19-13-19-24V16z M32 19v24 M22 30h20' },
}

export const alkkagiItemTypes = Object.keys(artwork)

export function AlkkagiItemCard({ type, selected = false, disabled = false, onClick }: {
  type: string; selected?: boolean; disabled?: boolean; onClick?(): void
}) {
  const [failed, setFailed] = useState(false)
  const art = artwork[type]
  if (!art) return null
  const image = images[type], hasImage = !!image && !failed
  const content = <><span className="item-card-kicker">온탑 · 비책</span>
    <span className="item-card-art"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={art.path} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg></span><span className="item-card-name">{art.name}</span><span className="item-card-caption">{art.caption}</span>
    <span className="item-card-seal" aria-hidden="true">策</span></>
  const contents = <>{hasImage ? <><img className="item-card-picture" src={image} alt="" width="600" height="900"
    loading={onClick ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
    <span className="item-card-image-copy"><span className="item-card-name">{art.name}</span><span className="item-card-caption">{art.caption}</span></span></> : content}
    {selected && <span className="item-card-selected">선택됨</span>}</>
  const classes = 'item-card' + (hasImage ? ' item-card-image' : '')
  const style = { '--item-ink': art.color } as CSSProperties
  return onClick ? <button type="button" className={classes} style={style} aria-label={art.name}
    aria-pressed={selected} disabled={disabled} onClick={onClick}>{contents}</button>
    : <article className={classes + ' item-card-sample'} style={style} aria-label={art.name}>{contents}</article>
}
