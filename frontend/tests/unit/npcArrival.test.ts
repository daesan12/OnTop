import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/ai/companions',async original=>{
 const m=await original<typeof import('../../src/features/ai/companions')>()
 return {...m,useCompanions:Object.assign(<T>(select:(s:ReturnType<typeof m.useCompanions.getState>)=>T)=>select(m.useCompanions.getState()),m.useCompanions)}
})
import {NpcArrivalPanel} from '../../src/features/ai/NpcArrivalPanel'
import {ResidentSeatInvite} from '../../src/ai-park/ResidentSeatInvite'
import {acceptCompanionActors,resetCompanions,useCompanions,type Practice,type CompanionActor} from '../../src/features/ai/companions'
import {practiceAction} from '../../src/ai-park/practiceActions'
import {useSession} from '../../src/network/worldClient'
import {parkRuntime} from '../../src/park/runtime/runtime'
const p:Practice={name:'박영감',npcUserId:'9001',difficulty:'HARD',phase:'ARRIVING',bet:0,thinking:false,speech:'',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'arrival',tableId:'table1',version:0,blackUserId:101,whiteUserId:9001,turnUserId:101,winnerUserId:null,turnDeadline:null,endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,outcome:'PLAYING',forbiddenMoves:[]}}}
beforeEach(()=>{resetCompanions();useSession.setState({sessionId:'101',status:'connected'});vi.restoreAllMocks()})
it('shows an arrival notice and cancel before the board opens, then removes the notice',()=>{
 useCompanions.setState({practice:p})
 const html=renderToStaticMarkup(createElement(NpcArrivalPanel))
 expect(html).toContain('박영감');expect(html).toContain('자리에 앉고 있어요.');expect(html).toContain('호출 취소')
 useCompanions.setState({practice:{...p,phase:'PLAYING'}})
 expect(renderToStaticMarkup(createElement(NpcArrivalPanel))).toBe('')
})
it('does not block a difficulty because another table has the same temporary opponent',()=>{
 useCompanions.setState({actors:[{id:'other',name:'박영감',channelId:'one',role:'OPPONENT',difficulty:'HARD',action:'PLAY_OMOK',x:0,y:0,z:0,seated:true,moving:false}]})
 const html=renderToStaticMarkup(createElement(ResidentSeatInvite,{disabled:false}))
 expect(html).toContain('박영감(어려움)');expect(html).not.toContain('disabled');expect(html).not.toContain('대결 중')
})
it('accepts bounded snapshots with more than eight independent actors',()=>{
 const actors:CompanionActor[]=Array.from({length:12},(_,i)=>({id:`opponent-${i}`,name:'박영감',channelId:'one',role:'OPPONENT',x:i,y:0,z:0,seated:true,moving:false}))
 expect(acceptCompanionActors({version:1,actors})).toBe(true)
 expect(useCompanions.getState().actors).toHaveLength(12)
 expect(acceptCompanionActors({version:2,actors:Array.from({length:65},()=>actors[0])})).toBe(false)
})
it('can cancel an arriving game before a display-game snapshot exists',async()=>{
 useCompanions.setState({practice:p})
 const request=vi.spyOn(parkRuntime,'requestJSON').mockResolvedValueOnce({stopped:true}).mockResolvedValueOnce({...useCompanions.getState(),actors:[],practice:null})
 await practiceAction('stop')
 expect(request.mock.calls[0]?.[0]).toContain('/action')
 expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toMatchObject({kind:'stop',gameId:'arrival'})
 expect(useCompanions.getState().practice).toBeNull()
})
