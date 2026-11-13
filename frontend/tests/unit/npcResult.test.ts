import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
import {npcResultModel,dismissNpcResult,getNpcResult,leaveNpcResult} from '../../src/features/ai/NpcResultPanel'
import {acceptAiFeatures} from '../../src/features/ai/serviceFeatures'
import {acceptCompanions,resetCompanions,useCompanions,type Practice} from '../../src/features/ai/companions'
import {useSession} from '../../src/network/worldClient'
import {useGame,resetGame} from '../../src/game/store'
import {parkRuntime} from '../../src/park/runtime/runtime'

const finished=(winner:number|null=101):Practice=>({name:'윤한수',npcUserId:'9001',difficulty:'NORMAL',phase:'PLAYING',bet:0,thinking:false,speech:'',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'npc-result',tableId:'table1',version:27,blackUserId:101,whiteUserId:9001,turnUserId:null,winnerUserId:winner,turnDeadline:null,endedAt:new Date().toISOString(),endReason:'FIVE',board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:27,outcome:'BLACK_WIN',forbiddenMoves:[]}}})
const status=(practice:Practice|null)=>({actors:[],practice,commentary:[],waitSeconds:-1})
beforeEach(()=>{resetCompanions();resetGame();acceptAiFeatures({companions:true,jokeContest:false});useSession.setState({sessionId:'101',tableId:'table1',seatIndex:0,status:'connected'});vi.restoreAllMocks()})
it.each([[101,'승리'],[9001,'패배'],[null,'무승부']] as const)('presents both participants and the correct outcome for winner %s', (winner,label)=>{
 const base=useGame.getState(),model=npcResultModel(finished(winner),'101','홍팀 로컬')
 expect(model.rows.map(r=>r.nickname)).toEqual(['홍팀 로컬','윤한수'])
 expect(model.rows[0].label).toBe(label);expect(model.canReturn).toBe(true)
 expect(model.settlement).toContain('엽전 변동 없음');expect(useGame.getState()).toBe(base)
})
it('retains the result after server cleanup, and clears it locally without financial requests',async()=>{
 acceptCompanions(status(finished()));acceptCompanions(status(null))
 expect(useCompanions.getState().finishedPractice?.snapshot.gameId).toBe('npc-result')
 const request=vi.spyOn(parkRuntime,'requestJSON')
 expect(await dismissNpcResult('npc-result')).toBe(true)
 expect(useCompanions.getState().finishedPractice).toBeNull();expect(request).not.toHaveBeenCalled()
})
it('stops the retained opponent before returning to the lobby',async()=>{
 acceptCompanions(status(finished()))
 const original=useGame.getState(),request=vi.spyOn(parkRuntime,'requestJSON').mockResolvedValueOnce({stopped:true}).mockResolvedValueOnce(status(null))
 expect(await dismissNpcResult('npc-result')).toBe(true)
 expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toMatchObject({kind:'stop',gameId:'npc-result'})
 expect(useCompanions.getState().practice).toBeNull();expect(useCompanions.getState().finishedPractice).toBeNull()
 expect(useGame.getState()).toBe(original)
})
it('preserves the result and error when cleanup fails, then allows retry',async()=>{
 acceptCompanions(status(finished()))
 const request=vi.spyOn(parkRuntime,'requestJSON').mockRejectedValueOnce(Error('offline'))
 expect(await dismissNpcResult('npc-result')).toBe(false)
 expect(useCompanions.getState().finishedPractice).not.toBeNull();expect(useCompanions.getState().practiceError).toContain('처리하지 못했어요')
 request.mockResolvedValueOnce({stopped:true}).mockResolvedValueOnce(status(null))
 expect(await dismissNpcResult('npc-result')).toBe(true)
})
it('does not let an observer, different game or live game dismiss an opponent',async()=>{
 const request=vi.spyOn(parkRuntime,'requestJSON')
 acceptCompanions({...status(null),observedPractice:finished()});expect(await dismissNpcResult('npc-result')).toBe(false)
 acceptCompanions(status(finished()));expect(await dismissNpcResult('other')).toBe(false)
 const live=finished();live.snapshot.endedAt=null;acceptCompanions(status(live))
 expect(useCompanions.getState().finishedPractice).toBeNull();expect(await dismissNpcResult('npc-result')).toBe(false)
 expect(request).not.toHaveBeenCalled()
})
it('does not mask the next human game with a cached NPC result',()=>{
 acceptAiFeatures({companions:true,jokeContest:false});acceptCompanions(status(finished()));acceptCompanions(status(null))
 expect(getNpcResult()).not.toBeNull()
 useGame.setState({start:{tableId:'table1',revision:1,phase:'STARTING',startAttemptId:'human-start',gameCode:'OMOK',gameSessionId:null,code:null,simulation:false}})
 expect(getNpcResult()).toBeNull()
})
it.each(['table','account','room'] as const)('does not leave the new %s context after a delayed stop',async kind=>{
 acceptCompanions(status(finished()))
 let resolve!:(value:unknown)=>void
 vi.spyOn(parkRuntime,'requestJSON').mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 const dismiss=dismissNpcResult('npc-result')
 useSession.setState(kind==='table'?{tableId:'table2'}:kind==='account'?{sessionId:'102'}:{roomId:'other'})
 resetCompanions();resolve({stopped:true})
 expect(await dismiss).toBe(false)
})
it('leaves via TABLE_LEFT without the cleanup HTTP endpoint',async()=>{
 acceptCompanions(status(finished()))
 const request=vi.spyOn(parkRuntime,'requestJSON')
 const leave=vi.fn(async()=>{useSession.setState({tableId:'',seatIndex:-1});return true})
 expect(await leaveNpcResult('npc-result',leave)).toBe(true)
 expect(request).not.toHaveBeenCalled();expect(leave).toHaveBeenCalledOnce()
 expect(useCompanions.getState().practice).toBeNull();expect(useCompanions.getState().finishedPractice).toBeNull()
})
it.each([false,'throws'])('keeps the result when the authoritative leave fails (%s)',async failure=>{
 acceptCompanions(status(finished()))
 const leave=vi.fn(async()=>{if(failure==='throws')throw Error('offline');return false})
 expect(await leaveNpcResult('npc-result',leave)).toBe(false)
 expect(useCompanions.getState().finishedPractice).not.toBeNull();expect(useSession.getState().tableId).toBe('table1')
 expect(useCompanions.getState().practiceError).toContain('자리에서 일어나지 못했어요')
})
it('does not erase the new game after a delayed table leave acknowledgment',async()=>{
 acceptCompanions(status(finished()))
 let resolve!:(value:boolean)=>void
 const task=leaveNpcResult('npc-result',()=>new Promise(r=>{resolve=r}))
 useSession.setState({tableId:'table2'});const next=finished();next.snapshot.gameId='new-game';next.snapshot.tableId='table2'
 acceptCompanions(status(next));resolve(true)
 expect(await task).toBe(false);expect(useCompanions.getState().practice?.snapshot.gameId).toBe('new-game')
})
