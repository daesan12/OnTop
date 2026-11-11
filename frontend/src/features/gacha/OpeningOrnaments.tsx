import type {CSSProperties} from 'react'
import {CAPSULES} from './capsuleMotion'
export function PartIcon({part}:{part:string}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{part==='머리'?<><path d="M4 13h16M7 13l1-7h8l1 7M3 17c5 3 13 3 18 0l-1-4H4z"/></>:part==='얼굴'?<><path d="M6 10c0-9 12-9 12 0v4c0 8-12 8-12 0zM6 9l4-3 8 3"/><path d="M9 12h.1M15 12h.1M10 16c1 1 3 1 4 0"/></>:<><path d="M8 4 3 7l2 6 3-1v8h8v-8l3 1 2-6-5-3M8 4l4 4 4-4M12 8v12"/></>}</svg>
}
export function WearParts({parts}:{parts:string[]}){
 return <div className="open-wear" aria-label="착용 부위"><span className="open-wear-label">착용 부위</span><p className="open-parts">{parts.length?parts.map((part,i)=><span className="open-part" key={part}><PartIcon part={part}/><span>{part}</span>{i<parts.length-1?' · ':''}</span>):<span className="open-parts-empty">구성은 옷장에서 확인할 수 있어요</span>}</p></div>
}
export function OpenShell({grade}:{grade:number}){
 return <div className="open-display-shell" aria-hidden="true" style={{'--shell-art':`url("${CAPSULES[grade]!.src}")`} as CSSProperties}><div className="open-shell-lid"/><div className="open-shell-orbit"/><div className="open-shell-bowl"/></div>
}
