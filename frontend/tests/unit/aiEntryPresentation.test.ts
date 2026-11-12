import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/ai/jokeContest',async original=>{
 const m=await original<typeof import('../../src/features/ai/jokeContest')>()
 return {...m,useJokeContest:Object.assign(()=>m.useJokeContest.getState(),m.useJokeContest)}
})
import {CompanionPanel} from '../../src/ai-park/CompanionPanel'
import {JokeContestPanel} from '../../src/ai-park/JokeContestPanel'
import {ResidentSeatInvite} from '../../src/ai-park/ResidentSeatInvite'
import {acceptAiFeatures,resetAiFeatures} from '../../src/features/ai/serviceFeatures'
import {canReachJokeJudge,closeJokeContest,jokeJudgePosition,openJokeContest} from '../../src/features/ai/jokeContest'

beforeEach(()=>{resetAiFeatures();closeJokeContest()})
it('does not expose global resident or joke ranking launchers while roaming',()=>{
 acceptAiFeatures({companions:true,jokeContest:true})
 const markup=renderToStaticMarkup(createElement('div',null,createElement(CompanionPanel),createElement(JokeContestPanel)))
 expect(markup).not.toContain('주민 · 대화 / 오목')
 expect(markup).not.toContain('탑골 아재왕 · 랭킹')
 expect(markup).not.toContain('<button')
})
it('keeps the nearby judge dialogue and its ranking view accessible',()=>{
 acceptAiFeatures({companions:true,jokeContest:true})
 expect(canReachJokeJudge({...jokeJudgePosition,y:jokeJudgePosition.y+.8})).toBe(true)
 expect(canReachJokeJudge({...jokeJudgePosition,x:jokeJudgePosition.x+10})).toBe(false)
 openJokeContest()
 const dialogue=renderToStaticMarkup(createElement(JokeContestPanel))
 expect(dialogue).toContain('도전해 보겠나?')
 expect(dialogue).toContain('오늘의 아재왕')
 closeJokeContest();openJokeContest('ranking')
 expect(renderToStaticMarkup(createElement(JokeContestPanel))).toContain('오늘 순위')
})
it('keeps opponent selection at the empty table seat',()=>{
 const markup=renderToStaticMarkup(createElement(ResidentSeatInvite,{disabled:false}))
 expect(markup).toContain('오목 AI 상대 선택')
 expect(markup).toContain('강잼민(쉬움)')
 expect(markup).toContain('윤한수(보통)')
 expect(markup).toContain('박영감(어려움)')
})
