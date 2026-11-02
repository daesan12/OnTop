import { useLayoutEffect } from 'react'

/** 손패의 가로 중심을 유지하며 공통 채팅과 겹치는 화면에서는 카드와 행동 바를 위로 올린다. */
export function useChatClearance(gameId:string, player:boolean) {
  useLayoutEffect(()=>{
    if(!gameId||!player)return
    const root=document.querySelector<HTMLElement>('.onecard-game-hud'),chat=document.querySelector<HTMLElement>('.park-chat')
    const pane=root?.querySelector<HTMLElement>('.onecard-actions-panel'),tray=root?.querySelector<HTMLElement>('.onecard-command-tray')
    if(!root||!chat||!pane||!tray)return
    const update=()=>{
      const c=chat.getBoundingClientRect(),p=pane.getBoundingClientRect()
      const overlaps=c.width>0&&c.height>0&&p.left<c.right+12&&p.right>c.left-12
      const bottom=overlaps?Math.max(16,innerHeight-c.top+12):16
      // 낮은 화면에서 기록을 펼쳐도 손패 전체가 화면 안에 남도록 카드 크기만 제한한다.
      const maxCardWidth=overlaps?Math.max(40,Math.min(144,(c.top-tray.getBoundingClientRect().height-86)/1.4)):144
      const values={
        '--oc-panel-bottom':`${Math.ceil(bottom)}px`,
        '--oc-card-max-width':`${Math.floor(maxCardWidth)}px`,
      }
      for(const [key,value] of Object.entries(values))if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value)
    }
    let frame=0
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update()})}
    const observer=new ResizeObserver(schedule)
    for(const node of [chat,pane,tray])observer.observe(node)
    window.addEventListener('resize',schedule);update()
    return()=>{
      observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule)
      for(const key of ['--oc-panel-bottom','--oc-card-max-width'])root.style.removeProperty(key)
    }
  },[gameId,player])
}
