/** Presentation of the server deadline; never restarts the clock locally. */
export function OmokTurnClock({remainingMs,label,hint,myTurn=false}:{remainingMs:number|null;label:string;hint:string;myTurn?:boolean}) {
  const value=remainingMs===null?null:Math.max(0,Math.min(30000,remainingMs))
  return <div className="omok-match-clock" aria-label="남은 착수 시간" role="timer"
    data-my-turn={myTurn} data-urgent={value!==null&&value>0&&value<=10000}>
    <span className="omok-turn-label">{label}</span>
    <strong>{value===null?'—':Math.ceil(value/1000)}<small>초</small></strong>
    <progress className="omok-turn-progress" aria-label="착수 남은 시간" max={30000} value={value??0}/>
    <small className="omok-clock-hint">{hint}</small>
  </div>
}
