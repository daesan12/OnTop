import type {CSSProperties} from 'react'
import {CAPSULES} from './capsuleMotion'
export function WearParts({parts}:{parts:string[]}){
 return <p className="open-parts">착용 부위: {parts.length?parts.join(' · '):'옷장에서 확인할 수 있어요'}</p>
}
export function OpenShell({grade}:{grade:number}){
 return <div className="open-display-shell" aria-hidden="true" style={{'--shell-art':`url("${CAPSULES[grade]!.src}")`} as CSSProperties}><div className="open-shell-lid"/><div className="open-shell-orbit"/><div className="open-shell-bowl"/></div>
}
