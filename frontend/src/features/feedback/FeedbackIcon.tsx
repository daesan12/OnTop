import type { FeedbackTopic } from './feedbackTopics'
const paths = {
  game: <><path d="M7 8h18c3 0 5 4 5 10s-2 8-5 6l-5-4h-8l-5 4c-3 2-5 0-5-6s2-10 5-10Z"/><path d="M9 12v7m-3.5-3.5h7M23 12h.01M26 16h.01"/></>,
  bug: <><path d="m13 3 1 4h4l1-4 4 2-2 4 3 3 4-1 1 5-4 1-1 4 3 3-4 3-3-3-4 1-1 4-5-1 1-4-3-3-4 2-2-4 4-2V12l-4-1 2-5 4 2 3-3Z"/><circle cx="16" cy="16" r="5"/></>,
  map: <><path d="M4 27h25M5 22h7l-3-5h3l-4-6-4 6h3l-3 5h1m3 0v5m8-1V7m-4 7 4-8 4 8h-3l4 7h-4m8 6V15m-4 4 4-7 4 7h-3l3 5h-4"/></>,
  other: <><path d="M28 14c0 7-7 12-15 10L6 28l1-7C0 15 3 5 15 5c8 0 13 3 13 9Z"/><path d="M10 14h.01M16 14h.01M22 14h.01"/></>,
  lock: <><rect x="7" y="14" width="18" height="15" rx="3"/><path d="M10 14V9a6 6 0 0 1 12 0v5m-6 6v4"/></>,
  send: <><path d="m3 14 26-11-8 26-6-10-12-5Z"/><path d="m15 19 14-16"/></>,
  roof: <><path d="M2 14 16 4l14 10M6 13v14m20-14v14M6 22h20"/><path d="M16 4v-2"/></>,
}
export function FeedbackIcon({ kind }: { kind: FeedbackTopic | 'lock' | 'send' | 'roof' }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
}
