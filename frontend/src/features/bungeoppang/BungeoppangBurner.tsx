import { useId, type CSSProperties } from 'react';
import { BURNER_JET_OFFSETS, burnerJetEls } from './layoutV5';

const HEIGHTS = [.82, 1, .76, .9, .78, 1, .86, .74];

/** Soft tongues of gas flame emerge from the actual iron edges, without a separate burner badge. */
export function BungeoppangBurner({ slot }: { slot: number }) {
  const id = useId(), flame = `${id}-flame`, core = `${id}-core`;
  return <span className="bung25-burner" aria-hidden="true">
    <svg width="0" height="0" className="bung25-burner-defs"><defs>
      <linearGradient id={flame} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#cbdce5" stopOpacity="0" />
        <stop offset=".35" stopColor="#94cfe4" stopOpacity=".65" />
        <stop offset=".72" stopColor="#479ed8" stopOpacity=".9" />
        <stop offset="1" stopColor="#2465ad" stopOpacity=".75" />
      </linearGradient>
      <linearGradient id={core} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff1d2" stopOpacity="0" />
        <stop offset=".6" stopColor="#d2eafa" stopOpacity=".85" />
        <stop offset="1" stopColor="#74bde9" />
      </linearGradient>
    </defs></svg>
    <span className="bung25-burner-jets">{BURNER_JET_OFFSETS.map((_, i) =>
      <i key={i} ref={el => { burnerJetEls[slot]![i] = el; }}
        style={{ height: `${HEIGHTS[i]! * 100}%`, '--jet-delay': `${i * -137}ms` } as CSSProperties}>
        <svg viewBox="0 0 24 48" preserveAspectRatio="none">
          <path fill={`url(#${flame})`} d="M5 47C-1 40 3 33 7 27C11 20 7 13 12 2C10 17 22 23 19 32C25 40 21 47 17 48Z" />
          <path fill={`url(#${core})`} d="M8 47C5 41 11 35 11 28C19 35 21 43 16 48Z" />
        </svg>
      </i>
    )}</span>
  </span>;
}
