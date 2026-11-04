import { GameHudClock } from '../GameHud'
/** Presentation of the server deadline; never restarts the clock locally. */
export function OmokTurnClock({remainingMs,label,hint,myTurn=false}:{remainingMs:number|null;label:string;hint:string;myTurn?:boolean}) {
  return <GameHudClock game="오목" remainingMs={remainingMs} label={label} hint={hint} myTurn={myTurn}/>
}
