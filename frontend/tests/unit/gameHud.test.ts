import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { GameHudClock, GameHudMenu } from '../../src/game/GameHud'
import { installHalliControls } from '../../src/game/halligalli/controls'
import { useGame, resetGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { parkRuntime } from '../../src/park/runtime/runtime'

vi.mock('../../src/park/runtime/runtime',()=>({parkRuntime:{ringHalli:vi.fn()}}))
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();resetGame()})

it('renders the supplied deadline without granting a new turn or changing its limit',()=>{
  const html=(remainingMs:number)=>renderToStaticMarkup(createElement(GameHudClock,{game:'오목',label:'상대 차례',remainingMs}))
  expect(html(8200)).toContain('>9<small>초</small>')
  expect(html(-1)).toContain('>0<small>초</small>')
  expect(html(-1)).toContain('value="0"')
  expect(html(40000)).toContain('>30<small>초</small>')
  const short=renderToStaticMarkup(createElement(GameHudClock,{game:'할리갈리',label:'내 차례',remainingMs:2500,limitMs:5000}))
  expect(short).toContain('max="5000" value="2500"')
})
it('hides a countdown during a resolution phase instead of presenting it as an actionable turn',()=>{
  const html=renderToStaticMarkup(createElement(GameHudClock,{game:'알까기',label:'상대 차례',remainingMs:15000,phase:'충돌 판정'}))
  expect(html).toContain('충돌 판정');expect(html).not.toContain('<progress')
})
it('keeps the game callbacks and their disabled state inside a native collapsible menu',()=>{
  const html=renderToStaticMarkup(createElement(GameHudMenu,{children:createElement('button',{disabled:true},'기권')}))
  expect(html).toContain('<summary>');expect(html).toContain('게임 메뉴')
  expect(html).toContain('<button disabled="">기권</button>');expect(html).not.toContain('<details open')
})
it('Space on game navigation never rings the Halli bell; Space on the play area still does',()=>{
  const listeners=new Map<string,EventListener>()
  vi.stubGlobal('window',{addEventListener:(type:string,fn:EventListener)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)})
  vi.stubGlobal('document',{hidden:false})
  class Target {constructor(private menu:boolean){} closest(selector:string){return this.menu&&selector.includes('.game-hud-menu')?this:null}}
  vi.stubGlobal('HTMLElement',Target)
  for(const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key]=false
  useSession.setState({status:'connected'})
  useGame.setState({game:{gameId:'halli-keyboard',version:7,role:'PLAYER',halli:{bellWindowId:4}} as never})
  const dispose=installHalliControls(),preventDefault=vi.fn()
  const press=(menu:boolean)=>listeners.get('keydown')!({code:'Space',target:new Target(menu),preventDefault} as unknown as Event)
  press(true);expect(parkRuntime.ringHalli).not.toHaveBeenCalled();expect(preventDefault).not.toHaveBeenCalled()
  press(false);expect(parkRuntime.ringHalli).toHaveBeenCalledWith(4,7);expect(preventDefault).toHaveBeenCalledOnce()
  dispose();expect(listeners.size).toBe(0)
})
