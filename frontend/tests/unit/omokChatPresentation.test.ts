import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
// Static rendering otherwise reads Zustand's initial server snapshot, not this fixture.
vi.mock('../../src/game/store',async original=>{
  const m=await original<typeof import('../../src/game/store')>()
  return {...m,useGame:Object.assign(<T>(select:(s:ReturnType<typeof m.useGame.getState>)=>T)=>select(m.useGame.getState()),m.useGame)}
})
vi.mock('../../src/game/omok/spectatorEvents',async original=>{
  const m=await original<typeof import('../../src/game/omok/spectatorEvents')>()
  return {...m,useOmokEvents:Object.assign(<T>(select:(s:ReturnType<typeof m.useOmokEvents.getState>)=>T)=>select(m.useOmokEvents.getState()),m.useOmokEvents)}
})
vi.mock('../../src/network/worldClient',async original=>{
  const m=await original<typeof import('../../src/network/worldClient')>()
  return {...m,useSession:Object.assign(<T>(select:(s:ReturnType<typeof m.useSession.getState>)=>T)=>select(m.useSession.getState()),m.useSession)}
})
import {SpectatorChat,OmokFeedback} from '../../src/game/omok/OmokFeedback'
import {OmokTurnClock} from '../../src/game/omok/OmokTurnClock'
import {useOmokEvents,type ChatEvent} from '../../src/game/omok/spectatorEvents'
import {useGame} from '../../src/game/store'
import {useSession} from '../../src/network/worldClient'

const text='긴관전채팅'.repeat(30)
const message:ChatEvent={kind:'chat',gameId:'g',eventId:'00000000-0000-4000-8000-000000000001',senderUserId:'202',sentAt:1,serverNow:1,expiresAt:3001,text}
beforeEach(()=>{
  useGame.setState({game:{gameId:'g',version:1,role:'SPECTATOR',omok:{status:'PLAYING'}} as never,lastResult:null})
  useSession.setState({profiles:{'202':{userId:'202',nickname:'검수 관전자'} as never}})
  useOmokEvents.setState({canSend:true,scope:'g',sending:false,error:'',history:[message],chats:[],pings:[]})
})
it('floating messages may expire while the full spectator transcript remains readable',()=>{
  const html=renderToStaticMarkup(createElement(SpectatorChat))
  expect(html).toContain('role="log"');expect(html).toContain('경기 채팅 기록')
  expect(html).toContain(text);expect(html).toContain('검수 관전자');expect(html).toContain('data-has-history="true"')
  useGame.setState(s=>({game:{...s.game!,gameId:'other'} as never}))
  expect(renderToStaticMarkup(createElement(SpectatorChat))).not.toContain(text)
})
it('identifies each floating message so measured free-space placement can keep it stable',()=>{
  useOmokEvents.setState({chats:[{...message,slot:0,until:performance.now()+3000}]})
  const html=renderToStaticMarkup(createElement(OmokFeedback))
  expect(html).toContain('omok-chat-toasts');expect(html).toContain(text)
  expect(html).toContain('data-event-id="'+message.eventId+'"')
  expect(html).not.toContain('translateX');expect(html).not.toContain('left:')
})
it('displays the latest server deadline as seconds and a bounded 30-second progress bar',()=>{
  const clock=(remainingMs:number)=>renderToStaticMarkup(createElement(OmokTurnClock,{remainingMs,label:'내 차례',hint:'착수하세요'}))
  expect(clock(12345)).toContain('13<small>초')
  expect(clock(30000)).toContain('value="30000"');expect(clock(30000)).toContain('30<small>초')
  expect(clock(-1)).toContain('value="0"');expect(clock(32000)).toContain('value="30000"')
})
