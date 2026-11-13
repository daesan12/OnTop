import { useId } from 'react'

export function GameOverSplash() {
  const id = useId()
  const paint = (name: string) => `url(#${id}-${name})`

  return (
    <div className="finale-splash" aria-hidden="true">
      <svg viewBox="0 0 1000 650" preserveAspectRatio="none">
        <defs>
          <radialGradient id={`${id}-deposit`} cx="38%" cy="32%" r="70%">
            <stop stopColor="#756346" />
            <stop offset=".44" stopColor="#5c512f" />
            <stop offset=".78" stopColor="#443d26" />
            <stop offset="1" stopColor="#292719" stopOpacity=".83" />
          </radialGradient>
          <radialGradient id={`${id}-smear`} cx="41%" cy="44%" r="59%">
            <stop stopColor="#8b7650" stopOpacity=".66" />
            <stop offset=".58" stopColor="#6f603d" stopOpacity=".55" />
            <stop offset="1" stopColor="#555136" stopOpacity=".13" />
          </radialGradient>
          <linearGradient id={`${id}-runoff`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop stopColor="#514a31" stopOpacity=".9" />
            <stop offset=".8" stopColor="#675a39" stopOpacity=".59" />
            <stop offset="1" stopColor="#746445" stopOpacity=".32" />
          </linearGradient>
          <filter id={`${id}-rough`} x="-10%" y="-15%" width="120%" height="130%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency=".043 .069" numOctaves="3" seed="17" result="edge" />
            <feDisplacementMap in="SourceGraphic" in2="edge" scale="14" xChannelSelector="R" yChannelSelector="G" result="warped" />
            <feTurbulence type="fractalNoise" baseFrequency=".31" numOctaves="2" seed="23" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 .11  0 0 0 0 .09  0 0 0 0 .05  .4 .3 .2 0 -.23" />
            <feComposite in2="warped" operator="in" result="flecks" />
            <feBlend in="flecks" in2="warped" mode="multiply" />
          </filter>
        </defs>

        <g className="finale-splash__impact" filter={paint('rough')}>
          <path fill={paint('smear')} d="M141 345C93 319 67 291 35 255c42 21 84 43 137 45 35-1 58-28 77-45 34-30 90-25 118-40 49-26 91-70 143-90-37 32-65 76-61 94 5 21 52 14 71 37 22 28 6 70 48 88 36 16 79 18 126 27-32 9-80 5-117 21-45 18-68 58-117 75-38 13-108 11-139 40-11 11-19 43-26 54-5-27-4-44 3-60 8-19-8-31-40-29-40 3-74 23-108 22 20-13 57-39 52-53-10-23-85-19-113-22 29-7 48-24 53-39 5-13 18-21-1-35Z" />
          <path fill={paint('deposit')} d="M170 328c19-7 53-16 74-35 27-24 45-45 80-45 21 0 36 8 64-5 30-14 49-2 50 18 1 19 11 24 37 19 24-4 50 10 56 27 5 17-9 36 10 49 13 9 37 6 53 16-24 8-48 4-67 10-14 4-18 28-41 34-30 8-57-9-81 7-26 17-34 27-65 29-24 1-46-13-70-10-19 2-32 19-57 19 10-10 21-23 17-31-6-14-22-11-37-11-26 0-55-16-41-36 8-10 26-14 21-28-2-9-21-20-35-27-8-4 22 3 32 0Z" />
          <path fill={paint('runoff')} d="M235 403c25-18 37-7 34 12-5 29-9 43-8 71 1 27-10 45-14 60-4 17 0 37-10 43-13 7-11-14-8-31 3-22 11-58 10-84-1-23-5-45-4-71ZM348 407c23-3 23 15 14 34-7 18-7 43-10 65-2 16-11 25-15 15-5-11 8-47 7-74 0-14-1-29 4-40Z" />
          <path fill="#a89971" opacity=".33" d="M220 366c19-13 33-22 50-43 14-16 46-29 74-28-12 5-32 14-39 22-14 18-31 22-44 26-16 4-22 19-41 23Zm112 56c12-11 32-16 50-18-7 7-12 11-27 15-9 3-17 3-23 3Z" />
        </g>

        <g className="finale-splash__scatter" filter={paint('rough')}>
          <path fill={paint('smear')} d="M972 86c-18 16-17 44 8 57 33 20 30 70-2 91-28 17-68 5-92 30-16 16-26 46-52 52 14-25 8-43-7-42-16 1-45 26-72 20 15-12 30-26 23-36-7-11-45 5-59 1 13-13 40-22 32-38-5-11-36-14-60-24 31-1 57 5 68-9 10-12-15-30-32-40 21 6 55 20 70 11 13-7-2-30-9-54 20 14 32 31 55 31 23-1 37-39 62-48 20-7 44 4 67-2Z" />
          <path fill={paint('deposit')} opacity=".9" d="M862 179c18-3 33-32 58-34 28-3 20 14 39 20 20 6 42-1 43 21 1 31-35 31-59 38-23 8-37-4-58 11-12 9-14 31-25 38-3-14 1-24-8-29-10-6-29 5-40-3 7-9 25-16 18-24-7-9-23-9-34-17 11-5 27-5 40-12 9-5 18-8 26-9Z" />
          <path fill={paint('runoff')} d="M955 213c20-10 17 15 14 33-3 17-8 35-9 57-2 23-10 34-14 28-5-9 3-28 5-46 3-24 4-44 4-72Z" />
          <path fill={paint('smear')} d="M726 446c42 10 67 27 108 19 30-6 41-30 76-29-13 8-29 24-17 36 12 12 56 3 84 9-10 8-17 16 7 32 37 25 24 70-10 76-23 4-54-16-76-9-21 7-13 38-24 59-9-16-5-36-13-48-16-23-39-19-62-23-25-4-40-19-68-25-18-4-48-7-65-18 24 2 60 5 69-11 7-11-5-29-26-39 25 6 52 13 56 4 4-10-30-21-39-33Z" />
          <path fill={paint('deposit')} opacity=".89" d="M801 488c21 0 37-2 57-14 23-13 41 6 61 7 32 2 57 15 55 42-2 20-32 27-51 22-26-7-46-12-70-4-18 6-38 7-55-5-11-7-10-19-22-27-10-6-24-6-39-13 23-1 40-7 64-8Z" />
          <path fill="#afa178" opacity=".29" d="M878 204c10-15 30-28 56-25-14 3-20 15-37 15-7 0-14 7-19 10ZM815 516c16-15 41-18 58-12-18 3-23 11-45 11l-13 1Z" />
          <path fill="#5d5132" opacity=".79" d="M69 210c-24-15-31-34-21-33 13 1 13 11 30 21 14 8 10 22-9 12Zm68 48c-15-6-33-8-36-17-4-13 12-9 24-3 13 6 25 14 12 20Zm385-81c6-12 25-25 38-26-3 10-23 26-31 30-6 3-9 1-7-4Zm107 142c19-6 37-4 34 5-3 7-30 8-41 4-6-3-2-6 7-9Zm64 81c14-2 29 4 27 10-1 5-21 8-33 2-7-4-4-10 6-12ZM88 448c18 0 35-9 44-5 13 6-11 13-21 17-17 8-28-1-23-12Zm84 77c9-14 23-14 21-6-2 7-17 23-23 21-6-2-2-8 2-15Zm476 42c-10-13 13-12 25-3 8 6 11 15 3 15-8 0-20-4-28-12Zm118 30c-14-3-19-14-13-17 7-4 23 6 27 11 5 7-4 8-14 6Z" />
          <path fill="#746743" opacity=".61" d="M104 208c9 0 17 8 14 11-4 5-21-2-21-6 0-3 3-5 7-5ZM165 279c-2-5 12-6 16-3 4 5-13 10-16 3Zm398-93c2-6 16-12 17-6 1 4-11 13-15 11-3-1-4-2-2-5Zm168 128c6-4 13-6 15-2 1 5-8 10-14 8-3-1-3-4-1-6Zm-54 100c8-2 10 8 2 9-6 0-9-7-2-9Zm63 16c3-6 15-4 15 3s-17 3-15-3Zm-618 69c8-6 18-7 19-1 1 5-12 11-18 9-4-1-5-5-1-8Zm532 90c3-7 18-4 17 2-1 7-21 5-17-2Zm153 14c6-4 16 6 13 10-4 5-17-7-13-10Z" />
        </g>
      </svg>
    </div>
  )
}
