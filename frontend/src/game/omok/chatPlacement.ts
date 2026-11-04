export interface ChatRect { left:number; top:number; right:number; bottom:number }
export interface ChatBox { key:string; width:number; height:number; slot:number }

const overlaps=(a:ChatRect,b:ChatRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top
const expand=(r:ChatRect,gap:number):ChatRect=>({left:r.left-gap,top:r.top-gap,right:r.right+gap,bottom:r.bottom+gap})
function subtract(area:ChatRect,block:ChatRect):ChatRect[] {
  if(!overlaps(area,block))return [area]
  const left=Math.max(area.left,block.left),right=Math.min(area.right,block.right)
  const top=Math.max(area.top,block.top),bottom=Math.min(area.bottom,block.bottom)
  return [
    {left:area.left,right:area.right,top:area.top,bottom:top},
    {left:area.left,right:area.right,top:bottom,bottom:area.bottom},
    {left:area.left,right:left,top,bottom},
    {left:right,right:area.right,top,bottom},
  ].filter(r=>r.right>r.left&&r.bottom>r.top)
}
function randomFor(key:string) {
  let state=2166136261
  for(const c of key)state=Math.imul(state^c.charCodeAt(0),16777619)
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
}

/** Stable per event, scattered only in space left by the board, HUD and other chats. */
export function placeFloatingChats(width:number,height:number,boxes:ChatBox[],blocked:ChatRect[],previous:ReadonlyMap<string,ChatRect>=new Map()) {
  const bounds={left:12,top:12,right:width-12,bottom:height-12}
  const obstacles=blocked.map(r=>expand(r,8))
  const result=new Map<string,ChatRect>()
  const fits=(r:ChatRect)=>r.left>=bounds.left&&r.top>=bounds.top&&r.right<=bounds.right&&r.bottom<=bounds.bottom&&!obstacles.some(b=>overlaps(r,b))
  // Retain visible messages when a different message arrives or expires.
  for(const box of boxes){
    const old=previous.get(box.key)
    if(old&&old.right-old.left===box.width&&old.bottom-old.top===box.height&&fits(old)){
      result.set(box.key,old);obstacles.push(expand(old,8))
    }
  }
  for(const box of boxes){
    if(result.has(box.key))continue
    const free=obstacles.reduce((areas,b)=>areas.flatMap(a=>subtract(a,b)),[bounds])
      .filter(a=>a.right-a.left>=box.width&&a.bottom-a.top>=box.height)
    if(!free.length)continue // The full message remains in the transcript on crowded screens.
    const random=randomFor(box.key)
    const preferred=free.filter(a=>(a.left+a.right<width)===(box.slot%2===0))
    const choices=preferred.length?preferred:free
    const area=choices[Math.floor(random()*choices.length)]!
    const left=Math.floor(area.left+random()*(area.right-area.left-box.width))
    const top=Math.floor(area.top+random()*(area.bottom-area.top-box.height))
    const rect={left,top,right:left+box.width,bottom:top+box.height}
    result.set(box.key,rect);obstacles.push(expand(rect,8))
  }
  return result
}
