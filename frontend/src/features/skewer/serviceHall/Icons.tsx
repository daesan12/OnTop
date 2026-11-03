export function HallIcon({ name }: { name: 'broom' | 'order' | 'pot' | 'cloche' | 'sake' | 'people' | 'reset' | 'help' | 'check' | 'dishes' | 'washer' | 'clock' | 'coin' | 'score' | 'pause' | 'storage' }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" className={`service-icon service-icon-${name}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {name === 'broom' ? <><path d="m22 3-7 14M9 15l11 5-5 10L3 24Z" fill="currentColor" /><path d="m8 20-3 6m7-5-3 7m6-5-2 6" stroke="#f8ecd0" strokeWidth="1.5" /></> : null}
    {name === 'order' ? <><path d="M10 5H6v24h20V5h-4M12 3h8v5h-8Z" /><path d="M10 14h12M10 20h12M10 25h7" /></> : null}
    {name === 'pot' ? <><path d="M7 15h18v10a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4ZM4 14h24M2 18h4m20 0h4M12 10h8M12 6c-3-2 3-3 0-5m8 5c-3-2 3-3 0-5" /></> : null}
    {name === 'cloche' ? <><path d="M4 24a12 12 0 0 1 24 0ZM2 28h28M16 12V8m-3 0h6" /><path d="m11 18-3 4" /></> : null}
    {name === 'sake' ? <><path d="M12 3h8v5c0 4 6 6 6 12v7c0 3-20 3-20 0v-7c0-6 6-8 6-12Z" fill="#f8eed8" stroke="#375c70" /><path d="M12 6h8M8 21h16v5H8Z" fill="#7095a1" stroke="#375c70" /><path d="M14 11h4" stroke="#375c70" /></> : null}
    {name === 'people' ? <><circle cx="12" cy="9" r="5" fill="currentColor" /><path d="M3 27v-6a9 9 0 0 1 18 0v6Z" fill="currentColor" /><path d="M23 4a5 5 0 0 1 0 10m2 3a8 8 0 0 1 5 8v2" /></> : null}
    {name === 'reset' ? <><path d="M6 10a11 11 0 1 1-1 12M6 3v8h8" /></> : null}
    {name === 'help' ? <><circle cx="16" cy="16" r="13" /><path d="M11 12a5 5 0 0 1 10 0c0 4-5 3-5 7m0 5v1" /></> : null}
    {name === 'check' ? <path d="m5 17 7 7L27 7" /> : null}
    {name === 'dishes' ? <><path d="M3 23c0 7 26 7 26 0M3 18c0 7 26 7 26 0" /><ellipse cx="16" cy="13" rx="13" ry="6" fill="#f5e5c7" /><path d="m11 11 3 3 5-4m3 5h2" stroke="#9a6846" /><path d="M7 8 5 5m19 2 2-3" /></> : null}
    {name === 'washer' ? <><rect x="3" y="3" width="26" height="27" rx="3" fill="#d8e4d9" /><path d="M4 10h24M8 6h6m10 0h1M8 25h16" /><path d="M9 16c2-4 4 4 7 0s4 4 7 0m-12 4c2-3 4 3 7 0" stroke="#407b7e" /></> : null}
    {name === 'clock' ? <><circle cx="16" cy="16" r="12" /><path d="M16 8v9l6 3" /></> : null}
    {name === 'score' ? <path d="m16 3 4 8 9 1-6.5 6.5 1.5 9-8-4-8 4 1.5-9L3 12l9-1Z" fill="#e9c16e" stroke="#fbe6ac" /> : null}
    {name === 'coin' ? <><circle cx="16" cy="16" r="13" fill="#e8b947" stroke="#a97827" /><circle cx="16" cy="16" r="9" stroke="#fff0a5" /><path d="M13 10h6v12h-6Z" stroke="#b7852d" /></> : null}
    {name === 'pause' ? <><path d="M11 7v18M21 7v18" strokeWidth="5" /></> : null}
    {name === 'storage' ? <><path d="M3 12h26v8H3ZM6 20v9m20-9v9M5 8h22M8 4h16" /><path d="M9 12v8m14-8v8" /></> : null}
  </svg>
}
