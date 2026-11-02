/** 화면 픽셀 대신 판의 XZ 좌표를 사용해 카메라 방향·배율에 관계없이 회전한다. */
export function wallRotationStep(previous:number, x:number, y:number) {
  if(![previous,x,y].every(Number.isFinite) || Math.hypot(x,y)<.08)return {angle:previous,delta:0}
  const angle=Math.atan2(y,x)
  return {angle,delta:Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous))}
}
