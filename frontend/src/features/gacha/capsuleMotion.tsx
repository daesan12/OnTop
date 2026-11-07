import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { GachaResult } from './contracts'
import { gachaAction, useGacha } from './state'
import { useSession } from '../../network/worldClient'
import { capsuleName } from './labels'

// Asset grade is an art rarity, not a server prize number. No visual RNG selects rewards.
export const CAPSULES: Record<number, { assetGrade: number; src: string; color: string }> = {
  1: { assetGrade: 4, src: new URL('./assets/capsule-4-red.webp', import.meta.url).href, color: '#ffd16a' },
  2: { assetGrade: 3, src: new URL('./assets/capsule-3-purple.webp', import.meta.url).href, color: '#e8b2ff' },
  3: { assetGrade: 2, src: new URL('./assets/capsule-2-blue.webp', import.meta.url).href, color: '#9cdbff' },
  4: { assetGrade: 1, src: new URL('./assets/capsule-1-green.webp', import.meta.url).href, color: '#d2f4b0' },
}
export type Phase = 'idle' | 'turning' | 'mixing' | 'slowdown' | 'drop' | 'landed' | 'anticipation' | 'reveal'
export function useCapsuleAssets() {
 const [attempt,setAttempt]=useState(0),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading')
 useEffect(()=>{
  let cancelled=false;setStatus('loading')
  Promise.all(Object.values(CAPSULES).map(asset=>new Promise<void>((resolve,reject)=>{
   const img=new Image();img.onload=()=>img.naturalWidth>0?resolve():reject();img.onerror=()=>reject();img.src=asset.src
  }))).then(()=>{if(!cancelled)setStatus('ready')},()=>{if(!cancelled)setStatus('error')})
  return()=>{cancelled=true}
 },[attempt])
 return {status,retry:()=>setAttempt(v=>v+1)}
}
type Kind = 'BUY' | 'DRAW'
const empty = { phase: 'idle' as Phase, phaseStartedAt: 0, result: null as GachaResult | null, busy: false, instant: false }
export function useCapsuleDraw(active: boolean, owner: string, reduced: boolean) {
  const [visual, setVisual] = useState(empty)
  const flight = useRef<AbortController | null>(null), skipped = useRef(false), reduce = useRef(reduced)
  reduce.current = reduced
  useEffect(() => {
    setVisual(empty)
    return () => { flight.current?.abort(); flight.current = null }
  }, [active, owner])
  const skip = () => { skipped.current = true }
  const dismiss = () => setVisual(empty)
  async function act(kind: Kind) {
    const s = useGacha.getState()
    if (!active || flight.current || s.busy || !s.state || s.owner !== owner || s.pending?.kind === 'OPEN') return
    const controller = new AbortController(), { signal } = controller
    flight.current = controller; skipped.current = false
    const effectiveKind = s.pending?.kind ?? kind
    let settled=false
    const current = () => !signal.aborted && flight.current === controller
      && useSession.getState().sessionId === owner && useSession.getState().status === 'connected'
    const wait = async (ms: number) => {
      const start = performance.now()
      while (current() && !skipped.current && !reduce.current && !(settled&&!useGacha.getState().result) && performance.now() - start < ms)
        await new Promise(resolve => setTimeout(resolve, 32))
    }
    const phase = (p: Phase) => { if (current()) setVisual(v => ({ ...v, phase: p, phaseStartedAt: performance.now() })) }
    try {
      setVisual({ busy: true, phase: effectiveKind === 'DRAW' ? 'turning' : 'idle', phaseStartedAt: performance.now(), result: null, instant: false })
      // gachaAction owns persisted operation IDs, idempotency and receipt recovery.
      const request = gachaAction(kind).finally(()=>{settled=true})
      const operationId = useGacha.getState().pending?.operationId
      if (effectiveKind === 'DRAW') { await wait(700); phase('mixing'); await wait(2600) }
      await request
      const receipt = useGacha.getState().result
      if (!current()) return
      if (!receipt || receipt.operationId !== operationId || receipt.kind !== effectiveKind) {
        setVisual(empty); return
      }
      if (effectiveKind === 'DRAW') {
        setVisual(v => ({ ...v, result: receipt }))
        phase('slowdown'); await wait(600)
        phase('drop'); await wait(520)
        phase('landed'); await wait(380)
        if (receipt.grade === 1) { phase('anticipation'); await wait(650) }
      }
      if (current()) setVisual({ busy: false, phase: 'reveal', phaseStartedAt: performance.now(), result: receipt, instant: skipped.current || reduce.current })
    } finally {
      if (flight.current === controller) {
        const stillCurrent = current()
        flight.current = null
        if (stillCurrent) setVisual(v => ({ ...v, busy: false }))
      }
    }
  }
  return { ...visual, act, skip, dismiss }
}

export function Coin({ className = '' }: { className?: string }) {
  const id=useId()
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id={id}><stop stopColor="#fff7ad"/><stop offset=".75" stopColor="#edb333"/><stop offset="1" stopColor="#a96b17"/></radialGradient></defs>
    <circle cx="50" cy="50" r="45" fill={'url(#'+id+')'} stroke="#ffe69a" strokeWidth="3"/>
    <circle cx="50" cy="50" r="35" fill="none" stroke="#bd8226" strokeWidth="2"/>
    <rect x="38" y="38" width="24" height="24" rx="2" fill="#684321" stroke="#ffdb75" strokeWidth="3"/>
    <path d="M27 39v22m46-22v22M39 27h22M39 73h22" stroke="#a66d19" strokeWidth="4"/>
  </svg>
}
export function Capsule({ grade, className = '' }: { grade: number; className?: string }) {
  const asset = CAPSULES[grade]
  return asset ? <img className={className} src={asset.src} alt={capsuleName(grade)} data-asset-grade={asset.assetGrade} draggable={false}/>
    : <Coin className={className}/>
}

export function RevealEffects({ grade }: { grade: number }) {
  const count = grade === 1 ? 48 : grade === 2 ? 30 : grade === 3 ? 18 : grade === 5 ? 20 : 8
  return <div className="capsule-effects" aria-hidden="true">
    <div className="reveal-halo"/>{grade <= 3 && <div className="reveal-ring"/>}{grade <= 2 && <><div className="reveal-beam"/><div className="reveal-ring second"/></>}
    {Array.from({ length: count }, (_, i) => <i key={i} className={grade === 5 ? 'coin-particle' : grade <= 2 && i % 3 === 0 ? 'petal' : 'spark'}
      style={{ '--a': i * 137.5 + 'deg', '--d': (8 + i % 7 * 2.2) + 'cqw', '--delay': (i % 8 * .055) + 's', '--size': (.22 + i % 3 * .12) + 'cqw' } as CSSProperties}>
      {grade === 5 ? <Coin/> : null}</i>)}
  </div>
}
