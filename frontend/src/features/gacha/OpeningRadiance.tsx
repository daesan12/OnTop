import type {CSSProperties} from 'react'

/** Layered light originates inside the bowl, behind the authoritative reward. */
export function OpeningRadiance({grade}:{grade:number}){
 const strength=grade===1?1:grade===2?.85:grade===3?.7:.55
 return <div className="open-radiance" aria-hidden="true" style={{'--light-strength':strength} as CSSProperties}>
  <div className="open-aureole"/>
  <svg className="open-sunbeams" viewBox="0 0 600 400" preserveAspectRatio="none">
   <defs><linearGradient id={`open-ray-${grade}`} x1="0" y1="1" x2="0" y2="0"><stop stopColor="#fff8c8" stopOpacity=".95"/><stop offset=".5" stopColor="#ffd14a" stopOpacity=".65"/><stop offset="1" stopColor="#fff5bb" stopOpacity="0"/></linearGradient></defs>
   {Array.from({length:11},(_,i)=><path key={i} d={`M300 338 L${25+i*51} ${i%2?15:55} L${48+i*51} ${i%2?20:60} Z`} fill={`url(#open-ray-${grade})`} style={{'--ray-delay':`${i*.045}s`} as CSSProperties}/>)}
  </svg>
  <div className="open-bowl-light"/>
  {Array.from({length:16},(_,i)=><i key={i} className="open-star" style={{left:`${12+(i*37)%78}%`,top:`${12+(i*23)%66}%`,'--star-size':`${i%3===0?19:9}px`,'--star-delay':`${(i%7)*.17}s`} as CSSProperties}/>)}
  {[0,1,2,3,4,5].map(i=><i key={i} className="open-petal" style={{left:`${7+(i*29)%86}%`,top:`${10+(i*17)%65}%`,'--petal-turn':`${i*53}deg`,'--petal-delay':`${i*.13}s`} as CSSProperties}/>)}
 </div>
}
