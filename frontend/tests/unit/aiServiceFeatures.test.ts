import {beforeEach,expect,it} from 'vitest'
import {acceptAiFeatures,companionPath,resetAiFeatures,residentsEnabled,useAiFeatures} from '../../src/features/ai/serviceFeatures'
import {useCompanions} from '../../src/features/ai/companions'
import {gameChatScope} from '../../src/features/chat/gameChat'
import {useGame} from '../../src/game/store'
import {resetWorldAi} from '../../src/features/ai/worldAi'
beforeEach(resetAiFeatures)
it('enables production presentation from server capability without opening local controls',()=>{
 expect(residentsEnabled()).toBe(false)
 expect(acceptAiFeatures({companions:true,jokeContest:false})).toBe(true)
 expect(residentsEnabled()).toBe(true)
 expect(companionPath('invite')).toBe('/api/v1/ai/companions/invite')
 resetAiFeatures();expect(residentsEnabled()).toBe(false)
})
it('rejects malformed flags and keeps the previous initialized state',()=>{
 acceptAiFeatures({companions:true,jokeContest:false})
 expect(acceptAiFeatures({companions:'true',jokeContest:false})).toBe(false)
 expect(useAiFeatures.getState().companions).toBe(true)
})
it('clears old practice chat authority on disconnect, channel change and feature disable',()=>{
 useGame.setState({game:null,watchedGameId:'',start:null})
 for(const reset of [resetAiFeatures,resetWorldAi,()=>acceptAiFeatures({companions:false,jokeContest:false})]){
  acceptAiFeatures({companions:true,jokeContest:false})
  useCompanions.setState({practiceChat:{gameId:'old-npc',version:1,role:'PLAYER'},practicePending:true,reply:'old'})
  expect(gameChatScope()).toBe('old-npc');reset()
  expect(gameChatScope()).toBe('')
  expect(useCompanions.getState()).toMatchObject({practice:null,observedPractice:null,practiceChat:null,practicePending:false,reply:''})
 }
})


it('enables the service joke entry only after initialized capability',async()=>{
 const {jokeContestEnabled,jokeContestPath,openJokeContest,useJokeContest,closeJokeContest}=await import('../../src/features/ai/jokeContest')
 closeJokeContest();expect(jokeContestEnabled()).toBe(false);openJokeContest();expect(useJokeContest.getState().open).toBe(false)
 acceptAiFeatures({companions:false,jokeContest:true});expect(jokeContestEnabled()).toBe(true)
 expect(jokeContestPath('submissions')).toBe('/api/v1/ai/joke-contest/submissions')
 openJokeContest();expect(useJokeContest.getState().open).toBe(true);closeJokeContest()
})
