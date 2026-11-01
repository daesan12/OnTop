import { useId } from 'react'
import { useHalliUI } from './actions'
import type { HalliGalli } from './protocol'

/** Silver desk bell on a black base. The pressed window is read at click time from the shown state, then fixed. */
export function Bell({ halli, gameId, enabled, onRing }: { halli: HalliGalli; gameId: string; enabled: boolean; onRing: () => void }) {
  const mark = useHalliUI(s => s.gameId === gameId && halli.bellWindowId !== null ? s.rings[halli.bellWindowId] : undefined)
  const id = useId().replace(/:/g, '')
  const label = halli.bellWindowId === null ? '종 · 다음 카드를 기다리는 중' : mark === 'queued' ? '종 · 앞선 요청 뒤에 보냄'
    : mark === 'sent' ? '종 · 이 카드에서는 이미 쳤어요' : '종 치기 (Space)'
  return <button type="button" className="hg-bell" data-state={mark ?? (halli.bellWindowId === null ? 'closed' : 'open')}
    disabled={!enabled} aria-keyshortcuts="Space" aria-label={label} onClick={onRing}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-dome`} x1="0" x2="1">
          <stop offset="0" stopColor="#5d666f" /><stop offset=".22" stopColor="#d9dfe5" /><stop offset=".34" stopColor="#ffffff" />
          <stop offset=".5" stopColor="#c4cbd2" /><stop offset=".72" stopColor="#8b949d" /><stop offset="1" stopColor="#4c545c" />
        </linearGradient>
        <radialGradient id={`${id}-shade`} cx="50%" cy="15%" r="85%">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#1b2026" stopOpacity=".45" />
        </radialGradient>
        <linearGradient id={`${id}-steel`} x1="0" x2="1">
          <stop offset="0" stopColor="#6f7880" /><stop offset=".45" stopColor="#f4f7fa" /><stop offset="1" stopColor="#6a737b" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3d41" /><stop offset=".35" stopColor="#121314" /><stop offset="1" stopColor="#050505" />
        </linearGradient>
      </defs>
      <path d="M10 92C10 85 32 80 60 80C88 80 110 85 110 92V100C110 107 88 112 60 112C32 112 10 107 10 100Z" fill={`url(#${id}-base)`} />
      <ellipse cx="60" cy="91" rx="49" ry="10" fill="#26292c" />
      <ellipse cx="60" cy="90" rx="46" ry="8" fill="none" stroke="#5a5f64" strokeWidth="1" opacity=".7" />
      <rect x="54.5" y="16" width="11" height="18" rx="2" fill={`url(#${id}-steel)`} />
      <ellipse cx="60" cy="16" rx="10.5" ry="4.6" fill={`url(#${id}-steel)`} stroke="#4f575f" strokeWidth=".8" />
      <ellipse cx="57" cy="14.6" rx="4.2" ry="1.4" fill="#fff" opacity=".8" />
      <path d="M17 88C17 54 35 33 60 33C85 33 103 54 103 88Z" fill={`url(#${id}-dome)`} stroke="#4a5158" strokeWidth="1.2" />
      <path d="M17 88C17 54 35 33 60 33C85 33 103 54 103 88Z" fill={`url(#${id}-shade)`} />
      <path d="M33 80C33 60 41 46 52 40" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".75" />
      <path d="M78 42C88 50 94 64 95 80" fill="none" stroke="#2c3238" strokeWidth="3" strokeLinecap="round" opacity=".35" />
      <ellipse cx="60" cy="88" rx="43" ry="4.5" fill="#8a929a" stroke="#4a5158" strokeWidth="1" />
    </svg>
    <span>{mark === 'queued' ? '대기' : mark === 'sent' ? '쳤음' : '종'}</span>
  </button>
}
