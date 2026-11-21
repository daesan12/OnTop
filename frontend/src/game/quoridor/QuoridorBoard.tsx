import { useId, type CSSProperties } from 'react'
import type { Cell, Quoridor, Wall } from './protocol'

export const PLAYER_COLORS = ['#d7a444', '#ab4436', '#4b7549', '#437da0'] as const
export const GOAL_LABELS = { NORTH: '북쪽 끝줄', EAST: '동쪽 끝줄', SOUTH: '남쪽 끝줄', WEST: '서쪽 끝줄' }
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
export const coordinate = (cell: Cell) => `${String.fromCharCode(65 + cell.x)}${9 - cell.y}`

export function QuoridorPawn({ color }: { color: string }) {
  const gradient = useId().replaceAll(':', '')
  return <svg className="qr-pawn" viewBox="0 0 48 64" aria-hidden="true">
    <defs><radialGradient id={gradient} cx="30%" cy="20%" r="80%">
      <stop offset="0" stopColor="white" stopOpacity=".55" /><stop offset=".4" stopColor={color} />
      <stop offset="1" stopColor="#211a12" stopOpacity=".9" />
    </radialGradient></defs>
    <ellipse cx="24" cy="57" rx="20" ry="5" fill="#120d08" opacity=".35" />
    <path d="M19 24C18 36 13 38 8 47C2 59 46 59 40 47C35 38 30 36 29 24Z" fill={`url(#${gradient})`} stroke="#302115" strokeOpacity=".45" />
    <circle cx="24" cy="17" r="12" fill={`url(#${gradient})`} stroke="#302115" strokeOpacity=".3" />
  </svg>
}

interface Props {
  state: Quoridor; ownId: string; canAct: boolean; wallMode: boolean; orientation: Wall['orientation']
  selected: Wall | null; onSelect(wall: Wall): void; onMove(cell: Cell): void
  spectator?: boolean; onPing?(cell: Cell): void; pings?: Cell[]
}
export function QuoridorBoard({ state, ownId, canAct, wallMode, orientation, selected, onSelect, onMove, spectator, onPing, pings = [] }: Props) {
  const own = state.players.find(p => p.userId === ownId)
  return <div className="qr-board-frame"><div className="qr-board" role="group" aria-label="쿼리도 9×9 게임판">
    {Array.from({ length: 81 }, (_, index) => {
      const cell = { x: index % 9, y: Math.floor(index / 9) }, pawn = state.players.findIndex(p => p.active && same(p, cell))
      const legal = canAct && !wallMode && state.legalMoves.some(move => same(move, cell))
      const goal = own && (own.goal === 'NORTH' ? cell.y === 0 : own.goal === 'SOUTH' ? cell.y === 8 : own.goal === 'EAST' ? cell.x === 8 : cell.x === 0)
      return <button key={index} type="button" className="qr-cell" data-legal={legal} data-goal={!!goal}
        style={{ '--x': cell.x, '--y': cell.y } as CSSProperties}
        aria-label={`${coordinate(cell)}${pawn >= 0 ? ` · ${pawn + 1}번 말` : ''}${legal ? ' · 이동 가능' : ''}`}
        aria-disabled={!legal && !spectator} onClick={() => { if (spectator) onPing?.(cell); else if (legal) onMove(cell) }}>
        {pawn >= 0 ? <QuoridorPawn color={PLAYER_COLORS[pawn]} /> : legal ? <span className="qr-move-dot" /> : null}
        {pings.some(ping => same(ping, cell)) ? <span className="qr-ping" aria-label="관전자 추천" /> : null}
      </button>
    })}
    {state.walls.map(wall => <span key={`${wall.x}:${wall.y}:${wall.orientation}`} className="qr-wall" data-orientation={wall.orientation}
      style={{ '--x': wall.x, '--y': wall.y } as CSSProperties} />)}
    {canAct && wallMode ? state.legalWalls.filter(wall => wall.orientation === orientation).map(wall => <button type="button"
      key={`${wall.x}:${wall.y}`} className="qr-wall-slot" data-orientation={orientation} data-selected={!!selected && same(selected, wall) && selected.orientation === orientation}
      style={{ '--x': wall.x, '--y': wall.y } as CSSProperties} aria-label={`${coordinate(wall)} ${orientation === 'HORIZONTAL' ? '가로' : '세로'} 장벽 선택`}
      aria-pressed={!!selected && same(selected, wall) && selected.orientation === orientation} onClick={() => onSelect(wall)} />) : null}
  </div><div className="qr-board-caption"><span>반대편 끝줄이 목표입니다</span><span>A–I · 1–9</span></div></div>
}
