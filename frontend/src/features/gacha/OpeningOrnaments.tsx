import type {CSSProperties} from 'react'
import {CAPSULES} from './capsuleMotion'
export function OpenShell({grade}:{grade:number}){
 return <div className="open-display-shell" aria-hidden="true" style={{'--shell-art':`url("${CAPSULES[grade]!.src}")`} as CSSProperties}><div className="open-shell-lid"/><div className="open-shell-orbit"/><div className="open-shell-bowl"/></div>
}
