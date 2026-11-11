import {JokeJudgePlaceholder} from './JokeJudgePlaceholder'
import {NpcSpeechBubble} from './NpcSpeechBubble'
import {JOKE_CONTEST_ENABLED,jokeJudgePosition,useJokeContest} from './jokeContest'
/** Temporary, distinct event host. No extra server physics or movement stream. */
export function JokeJudgeActor(){const open=useJokeContest(s=>s.open);if(!JOKE_CONTEST_ENABLED)return null
 return <group position={[jokeJudgePosition.x,jokeJudgePosition.y,jokeJudgePosition.z]} name="joke-judge" userData={{action:open?'INTERACTING':'IDLE'}}>
  <JokeJudgePlaceholder talking={open}/><NpcSpeechBubble actor="joke-judge" name="김부장"/>
 </group>
}
