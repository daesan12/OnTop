import { useLayoutEffect } from 'react'

/** 공통 채팅의 실제 크기를 읽어 손패 공간만 확보한다. 채팅 크기나 행동 바의 가로 중심은 바꾸지 않는다. */
export function useChatClearance(gameId:string, player:boolean) {
  useLayoutEffect(()=>{
    if(!gameId||!player)return
    const root=document.querySelector<HTMLElement>('.onecard-game-hud'),chat=document.querySelector<HTMLElement>('.park-chat')
    const pane=root?.querySelector<HTMLElement>('.onecard-actions-panel'),tray=root?.querySelector<HTMLElement>('.onecard-command-tray')
    if(!root||!chat||!pane||!tray)return
    const update=()=>{
      const c=chat.getBoundingClientRect(),p=pane.getBoundingClientRect()
      const values={
        '--oc-hand-width':`${Math.max(160,p.width-Math.max(0,c.right+16-p.left))}px`,
        '--oc-chat-clearance':`${Math.ceil(innerHeight-c.top+12)}px`,
        '--oc-tray-height':`${Math.ceil(tray.getBoundingClientRect().height)}px`,
      }
      for(const [key,value] of Object.entries(values))if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value)
    }
    const observer=new ResizeObserver(update)
    for(const node of [chat,pane,tray])observer.observe(node)
    window.addEventListener('resize',update);update()
    return()=>{
      observer.disconnect();window.removeEventListener('resize',update)
      for(const key of ['--oc-hand-width','--oc-chat-clearance','--oc-tray-height'])root.style.removeProperty(key)
    }
  },[gameId,player])
}
