import {afterEach,beforeEach,expect,it} from 'vitest'
import {receive,resetWorld,useSession} from '../../src/network/worldClient'
import {validateChat} from '../../src/park/runtime/runtime'
import {useCompanions} from '../../src/features/ai/companions'
import {gameChatScope} from '../../src/features/chat/gameChat'
import {useWorldAi} from '../../src/features/ai/worldAi'
it('idle NPC speech stays in the actor snapshot and never enters chat history or warning events',()=>{
 const ambient={text:'산책하기 좋은 날이네요.',expiresAt:Date.now()+6000},before=useSession.getState().messages.length
 receive({type:'WORLD_AI_NPCS',requestId:null,payload:{channelId:'one',version:999,npcs:[{id:'police',name:'김 순경',action:'PATROL',x:0,y:0,z:0,yaw:0,moving:true,warp:0,ambient}]}})
 receive({type:'WORLD_AI_COMPANIONS',requestId:null,payload:{channelId:'one',version:999,actors:[{id:'omok-one',channelId:'one',name:'박영감',role:'GUIDE',x:0,y:0,z:0,yaw:0,moving:true,seated:false,ambient}]}})
 expect(useWorldAi.getState().npcs[0]?.ambient).toEqual(ambient)
 expect(useCompanions.getState().actors[0]?.ambient).toEqual(ambient)
 expect(useSession.getState().messages).toHaveLength(before);expect(useWorldAi.getState().police).toHaveLength(0)
})
afterEach(()=>useCompanions.setState({practice:null,practiceChat:null}))
beforeEach(()=>{resetWorld();useSession.setState({roomId:'one',status:'connected'})})
it('filters display history and bubbles while keeping the outbound text intact',()=>{
 const text='씨발 말고 안녕하세요',payload={channelId:'one',messageId:'m1',userId:'101',text,sentAt:new Date().toISOString()}
 expect(validateChat(text)).toBe(text)
 receive({type:'WORLD_CHAT_MESSAGE',requestId:null,payload})
 expect(payload.text).toBe(text)
 expect(useSession.getState().messages.at(-1)?.text).toBe('** 말고 안녕하세요')
 expect(useSession.getState().bubbles['101']?.text).toBe('** 말고 안녕하세요')
 receive({type:'WORLD_CHAT_MODERATED',requestId:null,payload:{channelId:'one',messageId:'m1',version:1}})
 expect(useSession.getState().messages.at(-1)?.text).toBe('** 말고 안녕하세요')
 expect(useSession.getState().bubbles['101']?.text).toBe('** 말고 안녕하세요')
})
it('keeps a local practice spectator in the private scope until leaving',()=>{
 useCompanions.setState({practiceChat:{gameId:'npc-private',version:2,role:'SPECTATOR'}})
 expect(gameChatScope()).toBe('npc-private')
 useCompanions.setState({practiceChat:null});expect(gameChatScope()).toBe('')
})
it('private NPC speech does not enter outside world history',()=>{
 receive({type:'WORLD_AI_COMPANION_SPEECH',requestId:null,payload:{channelId:'one',gameId:'npc-private',incidentId:'p',actorId:'omok-child-one',name:'김잼민',speech:'재밌는 판이야!',x:0,y:0,z:0,expiresAt:Date.now()+30000}})
 expect(useSession.getState().messages).toHaveLength(0)
 expect(useWorldAi.getState().police.at(-1)?.gameId).toBe('npc-private')
})
