import { useId } from 'react'

/** A stone pagoda and pond-leaf ribbon, shared by the personal record and podium rows. */
export function JumpmapMedal({ rank }: { rank?: number }) {
  const rim = useId(), face = useId()
  const tier = rank === 1 || rank === 2 || rank === 3 ? rank : 0
  const palettes = [
    ['#c8d7b5', '#6b8d76', '#426854'],
    ['#ffedb1', '#d1a14e', '#936b31'],
    ['#edf2ec', '#adbcb5', '#73877d'],
    ['#f1d5b2', '#bd8b62', '#885f43'],
  ] as const
  const [light, mid, dark] = palettes[tier]!
  return <svg className="jm-ranking-medal" viewBox="0 0 90 106" aria-hidden="true" focusable="false" data-tier={tier}>
    <defs>
      <linearGradient id={rim} x2="1" y2="1"><stop stopColor={light}/><stop offset=".5" stopColor={mid}/><stop offset="1" stopColor={dark}/></linearGradient>
      <linearGradient id={face} x2="0" y2="1"><stop stopColor="#fffaf0"/><stop offset="1" stopColor="#dce2cc"/></linearGradient>
    </defs>
    <path d="m25 64-7 36 23-12 5-20M49 68l5 20 20 12-8-36" fill="#355f4d" stroke="#264a3d" strokeWidth="1.5"/>
    <path d="m30 70-5 20 13-7M60 70l5 20-9-7" fill="none" stroke="#9cab7a" strokeWidth="2"/>
    <circle cx="45" cy="42" r="36" fill={`url(#${rim})`} stroke={dark} strokeWidth="1.5"/>
    <circle cx="45" cy="42" r="30" fill={`url(#${face})`} stroke={light} strokeWidth="2"/>
    <circle cx="45" cy="42" r="26.5" fill="none" stroke={mid} strokeWidth=".9" strokeDasharray="1 3"/>
    <g stroke="#566c60" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M22 64c11-5 35-5 46 0l-5 4H27Z" fill="#91a58a"/>
      <path d="M27 59h36v6H27Z" fill="#a3ad99"/>
      <path d="M36 45h18v13H36Z" fill="#cad0b9"/>
      <path d="m24 47 10-6h22l10 6-5 3H29Z" fill="#b5bfab"/>
      <path d="M39 31h12v10H39Z" fill="#d6d8c3"/>
      <path d="m29 33 9-5h14l9 5-4 3H33Z" fill="#b9c4b0"/>
      <path d="M42 22h6v6h-6Z" fill="#d6d8c3"/>
      <path d="m35 23 8-5h4l8 5-4 2H39Z" fill="#bdc8b4"/>
      <path d="M45 14v4" strokeWidth="2"/>
      <path d="M39 48v7m8-19v4" stroke="#edf0de"/>
    </g>
    <path d="M60 64c-1-7 3-11 8-12 0 7-3 11-8 12Z" fill="#47775c" stroke="#315642" strokeWidth="1"/>
    <path d="m25 17 1.5-4 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5Z" fill={light}/>
  </svg>
}
