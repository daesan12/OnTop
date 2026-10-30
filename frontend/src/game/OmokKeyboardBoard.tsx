import { useRef, useState } from 'react'
import type { Omok } from './protocol'

/** One tab stop for the board; permission is rechecked by the shared runtime command. */
export function OmokKeyboardBoard({ omok, canPlace, place }: {
  omok: Omok; canPlace(x: number, y: number): boolean; place(x: number, y: number): void
}) {
  const [cursor, setCursor] = useState(112)
  const board = useRef<HTMLDivElement>(null)
  return <details className="omok-keyboard"><summary>키보드로 오목판 조작</summary>
    <p id="omok-keyboard-help">방향키로 이동 · Enter 또는 Space로 착수 · Tab으로 판 나가기</p>
    <div ref={board} role="group" aria-label="오목판" aria-describedby="omok-keyboard-help" className="omok-accessible-board"
      onKeyDown={event => {
        const x = cursor % 15, y = Math.floor(cursor / 15)
        let next: number
        switch (event.key) {
          case 'ArrowLeft': next = y * 15 + Math.max(0, x - 1); break
          case 'ArrowRight': next = y * 15 + Math.min(14, x + 1); break
          case 'ArrowUp': next = Math.max(0, y - 1) * 15 + x; break
          case 'ArrowDown': next = Math.min(14, y + 1) * 15 + x; break
          case 'Home': next = event.ctrlKey ? 0 : y * 15; break
          case 'End': next = event.ctrlKey ? 224 : y * 15 + 14; break
          default: return
        }
        event.preventDefault(); event.stopPropagation()
        setCursor(next)
        board.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
      }}>
      {omok.board.flatMap((row, y) => row.map((stone, x) => {
        const cell = y * 15 + x, last = omok.lastMove?.x === x && omok.lastMove.y === y
        return <button key={cell} data-cell={cell} tabIndex={cursor === cell ? 0 : -1}
          className={(stone === 1 ? 'black' : stone === 2 ? 'white' : '') + (last ? ' last-move' : '')}
          aria-current={last ? true : undefined}
          aria-label={`${y + 1}행 ${x + 1}열 ${stone === 1 ? '흑돌' : stone === 2 ? '백돌' : '빈칸'}`}
          aria-disabled={!canPlace(x, y)} onFocus={() => setCursor(cell)}
          onClick={() => { if (canPlace(x, y)) place(x, y) }}>{stone ? '●' : '·'}</button>
      }))}
    </div>
  </details>
}
