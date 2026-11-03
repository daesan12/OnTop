/** Small vector ornaments and control icons; game models and textures stay unchanged. */
export function HudCorners() {
  return <span className="farkle-hud-corners" aria-hidden="true">{[0, 1, 2, 3].map(corner =>
    <svg key={corner} className={`farkle-corner farkle-corner-${corner}`} viewBox="0 0 40 40" fill="none">
      <path d="M2 38V14Q2 2 14 2H38M7 31V14Q7 7 14 7H31M4 21h10V11h10v10H14v10H4M14 7l7 7-7 7-7-7 7-7Z" />
      <path d="M27 3v8h10M3 27h8v10" />
    </svg>)}</span>
}

export function PlayerSeal({ active }: { active: boolean }) {
  return <svg className="farkle-player-seal" viewBox="0 0 60 60" aria-hidden="true">
    <circle cx="30" cy="30" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" />
    {active ? <g fill="currentColor">
      {[0, 72, 144, 216, 288].map(angle => <ellipse key={angle} cx="30" cy="20" rx="7" ry="10" transform={`rotate(${angle} 30 30)`} />)}
      <circle cx="30" cy="30" r="3" fill="#3a2c1c" />
    </g> : <g fill="currentColor"><circle cx="30" cy="23" r="9" /><path d="M12 48c0-19 36-19 36 0a27 27 0 0 1-36 0Z" /></g>}
  </svg>
}

export function HudIcon({ kind }: { kind: 'dice' | 'bank' | 'info' }) {
  return <svg className={`farkle-hud-icon farkle-hud-icon-${kind}`} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    {kind === 'dice' ? <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="m16 2 12 7v14l-12 7-12-7V9Zm0 14L4 9m12 7 12-7m-12 7v14" />
      <g fill="currentColor" stroke="none"><circle cx="12" cy="7" r="1.4" /><circle cx="20" cy="11" r="1.4" /><circle cx="10" cy="17" r="1.4" /><circle cx="10" cy="23" r="1.4" /><circle cx="21" cy="18" r="1.4" /><circle cx="24" cy="22" r="1.4" /></g>
    </g> : kind === 'bank' ? <g stroke="currentColor" strokeWidth="2">
      <ellipse cx="16" cy="7" rx="10" ry="4" /><path d="M6 7v5c0 5 20 5 20 0V7M6 16c0 5 20 5 20 0M6 21c0 5 20 5 20 0M6 12v10m20-10v10" />
    </g> : <g stroke="currentColor" strokeWidth="2"><circle cx="16" cy="16" r="13" /><path d="M16 14v10m0-16v2" /></g>}
  </svg>
}
