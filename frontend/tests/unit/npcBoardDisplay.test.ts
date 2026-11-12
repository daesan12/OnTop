import {afterEach,beforeEach,expect,it} from 'vitest'
import {useAiFeatures,resetAiFeatures} from '../../src/features/ai/serviceFeatures'
import {resetGame,useGame} from '../../src/game/store'
import {displayedGame,useDisplayGame,canPlaceDisplayed} from '../../src/game/displayGame'
import {useCompanions,type Practice} from '../../src/features/ai/companions'

function practice():Practice{return {name:'김잼민',npcUserId:'9001',difficulty:'EASY',phase:'PLAYING',bet:0,thinking:false,speech:'좋아',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',lastMove:{x:7,y:7,stone:'BLACK'},snapshot:{gameId:'npc-test',tableId:'table1',version:1,blackUserId:101,whiteUserId:9001,turnUserId:101,winnerUserId:null,turnDeadline:new Date(Date.now()+30000).toISOString(),endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:1,outcome:'PLAYING',forbiddenMoves:[{x:3,y:3,kind:'33'}]}}}}
beforeEach(()=>{resetAiFeatures();useAiFeatures.setState({companions:true,jokeContest:false,loaded:true})})
afterEach(()=>{resetAiFeatures();useCompanions.setState({practice:null,observedPractice:null,practiceChat:null,practicePending:false,practiceError:''});resetGame()})
it('projects the NPC snapshot into the existing board without modifying production authority',()=>{
 const p=practice(),original=useGame.getState()
 useCompanions.setState({practice:p,receivedAt:performance.now()})
 const s=useDisplayGame.getState()
 expect(s.game?.omok?.blackUserId).toBe('101');expect(s.game?.omok?.whiteUserId).toBe('9001')
 expect(s.game?.omok?.lastMove).toEqual(p.lastMove);expect(s.game?.omok?.board).toBe(p.snapshot.board.board)
 expect(useGame.getState()).toBe(original)
 expect(canPlaceDisplayed('101',7,7)).toBe(true);expect(canPlaceDisplayed('101',3,3)).toBe(false)
 useCompanions.setState({actorReceivedAt:performance.now()});expect(useDisplayGame.getState().game).toBe(s.game)
 useCompanions.setState({practice:structuredClone(p),receivedAt:performance.now()});expect(useDisplayGame.getState().game).toBe(s.game)
 expect(canPlaceDisplayed('9001',7,7)).toBe(false)
 useCompanions.setState({practicePending:true});expect(canPlaceDisplayed('101',7,7)).toBe(false)
 useCompanions.setState({practicePending:false,receivedAt:performance.now()-5000});expect(canPlaceDisplayed('101',7,7)).toBe(false)
})
it('keeps arrival out of the game camera and restores production display after release',()=>{
 const p=practice();p.phase='ARRIVING'
 useCompanions.setState({practice:p,receivedAt:performance.now()});expect(useDisplayGame.getState().game).toBeNull()
 useCompanions.setState({practice:{...p,phase:'PLAYING'}});expect(useDisplayGame.getState().game?.gameId).toBe('npc-test')
 useCompanions.setState({practice:null});expect(useDisplayGame.getState().game).toBe(useGame.getState().game)
})
it('renders an approved observer but never permits placement or a stale observed snapshot',()=>{
 const p=practice()
 useCompanions.setState({observedPractice:p,practiceChat:{gameId:'npc-test',version:1,role:'SPECTATOR'},receivedAt:performance.now()})
 expect(useDisplayGame.getState().game?.role).toBe('SPECTATOR');expect(canPlaceDisplayed('101',7,7)).toBe(false)
 useCompanions.setState({practiceChat:null});expect(useDisplayGame.getState().game).toBeNull()
})
it('shows terminal results with locked input, and clears NPC presentation when the service feature is disabled',()=>{
 const p=practice();p.snapshot.endedAt=new Date().toISOString();p.snapshot.winnerUserId=9001
 useCompanions.setState({practice:p,receivedAt:performance.now()})
 expect(useDisplayGame.getState().game?.omok?.status).toBe('FINISHED');expect(canPlaceDisplayed('101',7,7)).toBe(false)
 useAiFeatures.setState({companions:false});useCompanions.setState({practice:p});expect(useDisplayGame.getState().game).toBeNull()
 expect(displayedGame(useGame.getState(),null,0).localPractice).toBeNull()
})

it('does not project a practice snapshot before server features load or while companions are disabled',()=>{
 const p=practice()
 resetAiFeatures();useCompanions.setState({practice:p,receivedAt:performance.now()})
 expect(useDisplayGame.getState().game).toBe(useGame.getState().game)
 useAiFeatures.setState({loaded:true,companions:false})
 expect(useDisplayGame.getState().localPractice).toBeNull()
 useAiFeatures.setState({companions:true})
 expect(useDisplayGame.getState().game?.gameId).toBe('npc-test')
 useAiFeatures.setState({companions:false})
 expect(useDisplayGame.getState().game).toBe(useGame.getState().game)
 expect(canPlaceDisplayed('101',7,7)).toBe(false)
})
