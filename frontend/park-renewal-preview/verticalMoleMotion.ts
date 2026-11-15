import {MOLE_DEMO_DIMENSIONS as D} from './original/world/art/moleDemoDimensions.ts'
export const VERTICAL_MOLE={beat:2.4/1.15,impact:1.18/1.15,rotationZ:Math.PI/2,headHalfLength:.39} as const
const ease=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}
export function sampleVerticalMole(seconds:number){
 const time=Math.max(0,seconds)*1.15,beat=Math.floor(time/2.4),phase=time%2.4,order=[0,3,1,2]
 const pop=phase<1.22?ease(phase/.3):1-ease((phase-1.22)/.28),moleY=D.hiddenY+D.rise*pop
 const contact=D.hiddenY+D.rise+D.bodyTop+VERTICAL_MOLE.headHalfLength+D.clearance,rest=contact+.68
 const down=ease((phase-.9)/.28),up=ease((phase-1.22)/.38)
 const headY=phase<1.22?rest+(contact-rest)*down:contact+(rest-contact)*up
 return{target:order[beat%4]!,next:order[(beat+1)%4]!,pop,moleY,headY,travel:ease((phase-1.75)/.65),impact:phase>=1.18&&phase<1.5?1-(phase-1.18)/.32:0}
}
