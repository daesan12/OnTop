import {create} from 'zustand'
import {useGame,canPlace} from './store'
import {useCompanions,type Practice} from '../features/ai/companions'
import type {OmokGame} from './protocol'

// Presentation only: local NPC snapshots never grant production game authority.
type DisplayState=ReturnType<typeof useGame.getState>&{localPractice:Practice|null}
export function displayedGame(base:ReturnType<typeof useGame.getState>,practice:Practice|null,receivedAt:number,pending=false,error='',role:'PLAYER'|'SPECTATOR'='PLAYER'):DisplayState {
 if(!practice||practice.phase!=='PLAYING')return {...base,localPractice:null}
 const s=practice.snapshot
 const game:OmokGame={gameId:s.gameId,version:s.version,role,omok:{
  gameCode:'OMOK',status:s.endedAt?'FINISHED':'PLAYING',boardSize:15,board:s.board.board,
  forbiddenMoves:s.board.forbiddenMoves as OmokGame['omok']['forbiddenMoves'],moveCount:s.board.moveCount,
  blackUserId:String(s.blackUserId),whiteUserId:String(s.whiteUserId),turnUserId:s.turnUserId==null?null:String(s.turnUserId),
  winnerUserId:s.winnerUserId==null?null:String(s.winnerUserId),turnDeadline:s.turnDeadline,endedAt:s.endedAt,endReason:s.endReason,
  lastMove:practice.lastMove??null,
 }}
 return {...base,game,localPractice:practice,start:null,permittedGameId:role==='PLAYER'?s.gameId:'',watchedGameId:role==='SPECTATOR'?s.gameId:'',recovery:'RESTORED',
  result:null,lastResult:null,pending:pending||practice.thinking,uncertain:performance.now()-receivedAt>4000,awaitingVersion:-1,error}
}
let previous:DisplayState|undefined
function current():DisplayState {
 const s=useCompanions.getState()
 const enabled=import.meta.env.DEV&&import.meta.env.VITE_AI_PARK==='true'
 const practice=s.practice??(s.practiceChat?.role==='SPECTATOR'&&s.observedPractice?.snapshot.gameId===s.practiceChat.gameId?s.observedPractice:null)
 const next=displayedGame(useGame.getState(),enabled?practice:null,s.receivedAt,s.practicePending,s.practiceError,s.practice?'PLAYER':'SPECTATOR')
 // Actor movement and identical HTTP polls must not cancel a board pointer press.
 if(next.localPractice&&previous?.localPractice&&next.game?.gameId===previous.game?.gameId
  &&next.game?.version===previous.game?.version&&next.game?.role===previous.game?.role)next.game=previous.game
 previous=next
 return next
}
export const useDisplayGame=create<DisplayState>(current)
const sync=()=>useDisplayGame.setState(current(),true)
const stopGame=useGame.subscribe(sync),stopCompanions=useCompanions.subscribe(sync)
if(import.meta.hot)import.meta.hot.dispose(()=>{stopGame();stopCompanions()})
export function canPlaceDisplayed(own:string,x:number,y:number,now=Date.now()) {
 const s=useDisplayGame.getState(),p=s.localPractice,g=s.game
 if(!p)return canPlace(own,x,y,now)
 return !s.pending&&!s.uncertain&&performance.now()-useCompanions.getState().receivedAt<=4000
  &&g?.role==='PLAYER'&&g.omok?.status==='PLAYING'&&g.omok.turnUserId===own&&Date.parse(g.omok.turnDeadline??'')>now
  &&Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<15&&y>=0&&y<15&&g.omok.board[y]?.[x]===0
  &&!g.omok.forbiddenMoves?.some(v=>v.x===x&&v.y===y)
}
