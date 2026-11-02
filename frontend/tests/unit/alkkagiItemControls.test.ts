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
it('pins a valid wall, permits rotation without consumption, and installs only on explicit submission',()=>{
  const c=controls();c.selectItem({id:'w',type:'WALL'})
  c.pickPlacement(0,0);expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(-2,2,true);expect(mock.send).not.toHaveBeenCalled();expect(useAlkkagiUI.getState().pinned).toBe(false)
  c.pickPlacement(0,0,true);expect(mock.send).not.toHaveBeenCalled();expect(useAlkkagiUI.getState().pinned).toBe(true)
  c.pickPlacement(2,0);expect(useAlkkagiUI.getState().placement?.x).toBe(0)
  useAlkkagiUI.setState({placement:{x:0,y:0,angle:Math.PI/2}})
  c.placeWall();expect(mock.send).toHaveBeenCalledExactlyOnceWith({type:'ITEM_USE',cardId:'w',targetPieceIds:[],placement:{x:0,y:0,angle:Math.PI/2}})
})
it('does not submit a wall rotated into a piece, and cancellation consumes nothing',()=>{
  const c=controls();c.selectItem({id:'w',type:'WALL'});c.pickPlacement(-2,1.2,true)
  expect(useAlkkagiUI.getState().pinned).toBe(true)
  useAlkkagiUI.setState({placement:{x:-2,y:1.2,angle:Math.PI/2}})
  c.placeWall();expect(mock.send).not.toHaveBeenCalled()
  cancelAlkkagiItem();c.placeWall();expect(mock.send).not.toHaveBeenCalled()
})
it('relocation rejects outside positions but accepts distant empty destinations',()=>{
  const c=controls();c.selectItem({id:'r',type:'RELOCATE'});c.pickPlacement(0,0)
  c.chooseTarget(mock.state.pieces[0]);expect(useAlkkagiUI.getState().placement).toBeNull();expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(5,2,true);expect(mock.send).not.toHaveBeenCalled()
  c.pickPlacement(4,2,true);expect(mock.send).toHaveBeenCalledExactlyOnceWith({type:'ITEM_USE',cardId:'r',targetPieceIds:['a'],placement:{x:4,y:2,angle:0}})
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
