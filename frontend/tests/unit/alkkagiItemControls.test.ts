import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Snapshot } from '../../src/game/alkkagi/replay'

const mock=vi.hoisted(()=>({send:vi.fn(),state:null as any,ready:true}))
vi.mock('../../src/network/worldClient',()=>({useSession:()=>({sessionId:'101',status:'connected',pending:false})}))
vi.mock('../../src/game/store',()=>({useGame:()=>({game:{gameId:'g',version:1,role:'PLAYER',alkkagi:mock.state},
  permittedGameId:'g',pending:!mock.ready,uncertain:false,recovery:'RESTORED',awaitingVersion:1})}))
vi.mock('../../src/features/tableLobby/state',()=>({seatScope:()=>null,useTableLobby:()=>null}))
vi.mock('../../src/game/forfeit',()=>({useForfeit:()=>null,forfeitBlocksInput:()=>false}))
vi.mock('../../src/park/runtime/runtime',()=>({parkRuntime:{actAlkkagi:mock.send}}))
import { useAlkkagiControls, useAlkkagiUI, cancelAlkkagiItem } from '../../src/game/alkkagi/parkControls'

function controls() {
  let result!:ReturnType<typeof useAlkkagiControls>
  function Capture(){result=useAlkkagiControls();return null}
  renderToString(createElement(Capture))
  return result
}
beforeEach(()=>{
  mock.send.mockReset();mock.ready=true;cancelAlkkagiItem()
  mock.state={gameId:'g',players:['101','202'],version:1,stage:'AIMING',turn:0,itemUsedThisTurn:false,
    settings:{halfWidth:4.5,halfHeight:5},pieces:[
      {id:'a',owner:0,x:-2,y:2,radius:.24,alive:true},
      {id:'b',owner:1,x:2,y:-2,radius:.24,alive:true},
    ]} as unknown as Snapshot
})
it('uses a targeted card on the target click, with no confirmation request',()=>{
  const c=controls();c.selectItem({id:'c',type:'POWER_UP'});expect(mock.send).not.toHaveBeenCalled()
  c.chooseTarget(mock.state.pieces[0]);expect(mock.send).toHaveBeenCalledExactlyOnceWith({type:'ITEM_USE',cardId:'c',targetPieceIds:['a']})
  expect(useAlkkagiUI.getState().item).toBeNull()
  c.chooseTarget(mock.state.pieces[0]);expect(mock.send).toHaveBeenCalledTimes(1)
})
it('waits for both swap targets and allows the opposing piece',()=>{
  const c=controls();c.selectItem({id:'s',type:'SWAP'});c.chooseTarget(mock.state.pieces[0]);expect(mock.send).not.toHaveBeenCalled()
  c.chooseTarget(mock.state.pieces[1]);expect(mock.send).toHaveBeenCalledExactlyOnceWith({type:'ITEM_USE',cardId:'s',targetPieceIds:['a','b']})
})
it('keeps wall hover as a preview, rejects overlap, and commits only a valid click',()=>{
  const c=controls();c.selectItem({id:'w',type:'WALL'})
  c.pickPlacement(0,0);expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(-2,2,true);expect(mock.send).not.toHaveBeenCalled();expect(useAlkkagiUI.getState().pinned).toBe(false)
  c.pickPlacement(0,0,true);expect(mock.send).toHaveBeenCalledExactlyOnceWith({type:'ITEM_USE',cardId:'w',targetPieceIds:[],placement:{x:0,y:0,angle:0}})
})
it('relocation waits for a destination, clears the old preview, and rejects distant destinations',()=>{
  const c=controls();c.selectItem({id:'r',type:'RELOCATE'});c.pickPlacement(0,0)
  c.chooseTarget(mock.state.pieces[0]);expect(useAlkkagiUI.getState().placement).toBeNull();expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(4,2,true);expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(-1,2,true);expect(mock.send).toHaveBeenCalledTimes(1)
})
it('extra shot needs only the card click, but cannot bypass the pending or turn guard',()=>{
  controls().selectItem({id:'e',type:'EXTRA_SHOT'});expect(mock.send).toHaveBeenCalledTimes(1)
  mock.ready=false;controls().selectItem({id:'e',type:'EXTRA_SHOT'});expect(mock.send).toHaveBeenCalledTimes(1)
  mock.ready=true;mock.state.turn=1;controls().selectItem({id:'e',type:'EXTRA_SHOT'});expect(mock.send).toHaveBeenCalledTimes(1)
})
it('reclicking the selected card cancels it without spending it',()=>{
  const c=controls();c.selectItem({id:'c',type:'DEFEND'});c.selectItem({id:'c',type:'DEFEND'})
  expect(useAlkkagiUI.getState().item).toBeNull();expect(mock.send).not.toHaveBeenCalled()
})
