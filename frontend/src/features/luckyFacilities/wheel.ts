export const WHEEL_VALUES=[20,1,3,1,5,1,3,1,10,1,3,1,5,1,3,1,10,1,3,1] as const
export const wheelColor=(n:number)=>n===20?'#bd4939':n===10?'#87559b':n===5?'#3f7eaa':n===3?'#4d9067':'#e5b34c'
export const WHEEL_STEP=360/WHEEL_VALUES.length
/** The pointer is fixed at twelve o'clock; sector centres start at twelve o'clock. */
export function wheelLanding(previous:number,index:number){
  const target=(360-index*WHEEL_STEP)%360
  return previous+360*5+((target-previous%360+360)%360)
}
