import {useAiFeatures} from './serviceFeatures'
import {useRef} from 'react'
import {ResidentModel} from './ParkNpcModel'
import {NpcSpeechBubble} from './NpcSpeechBubble'
import {jokeContestEnabled,jokeJudgePosition,useJokeContest} from './jokeContest'
/** Dedicated event host; shares the resident animation lifecycle. */
export function JokeJudgeActor(){useAiFeatures(s=>s.jokeContest);const open=useJokeContest(s=>s.open),speed=useRef(0);if(!jokeContestEnabled())return null
 return <group position={[jokeJudgePosition.x,jokeJudgePosition.y,jokeJudgePosition.z]} name="joke-judge" userData={{action:open?'INTERACTING':'IDLE'}}>
  <ResidentModel kind="JUDGE" speed={speed} talking={open}/><NpcSpeechBubble actor="joke-judge" name="김부장"/>
 </group>
}
