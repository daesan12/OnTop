/** 같은 메시지·펼침 상태에서 공원의 기본 채팅과 원카드 채팅의 실제 크기를 비교한다. */
export function compareParkChat() {
  const chat=document.querySelector<HTMLElement>('.park-chat')!, park=chat.closest<HTMLElement>('.park-page')!
  const reference=document.createElement('div')
  reference.className='park-page'
  reference.style.cssText='position:fixed;inset:0;visibility:hidden;pointer-events:none'
  const style=getComputedStyle(park)
  for(const name of ['--park-edge','--park-ui-scale','--park-hint-scale'])reference.style.setProperty(name,style.getPropertyValue(name))
  const copy=chat.cloneNode(true) as HTMLElement
  reference.append(copy); document.body.append(reference)
  const box=(node:HTMLElement)=>{
    const r=node.getBoundingClientRect()
    return {x:r.x,y:r.y,width:r.width,height:r.height}
  }
  const result={actual:box(chat),common:box(copy)}
  reference.remove()
  return result
}
