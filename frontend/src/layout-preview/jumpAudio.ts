import type { JumpHit } from './jumpSimulation'
let context:AudioContext|undefined,noise:AudioBuffer|undefined,voices=0,lastVariant=-1
export function enableJumpAudio(){context??=new AudioContext();void context.resume()}
export function playJumpSound(hit:JumpHit,muted:boolean) {
  if(muted||!context||context.state!=='running'||voices>=6)return
  const ctx=context,t=ctx.currentTime,theme=hit.pad.theme,variant=(lastVariant+1+Math.floor(Math.random()*4))%5;lastVariant=variant
  if(!noise){noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}
  voices++;setTimeout(()=>voices--,650)
  const frequencies={stone:210,gomoku:hit.pad.ordinal%2?190:620,fish:380,cloud:170,lantern:760,kite:480,lily:130,gate:990}
  const base=frequencies[theme]*(.95+variant*.025)
  for(let layer=0;layer<3;layer++) {
    const at=t+[0,.015,.09][layer]!,gain=ctx.createGain(),duration=layer===2?.3:theme==='cloud'?.25:.13
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime([.045,.085,.027][layer]!,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+duration)
    gain.connect(ctx.destination)
    const crack=['stone','fish','kite'].includes(theme)&&layer!==0
    if(crack) {
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();source.buffer=noise;filter.type='bandpass';filter.frequency.value=theme==='kite'?2800:theme==='fish'?1350:850;filter.Q.value=.7
      source.connect(filter);filter.connect(gain);source.start(at,variant*.06,duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()}
    } else {
      const osc=ctx.createOscillator();osc.type=theme==='gomoku'?'triangle':'sine';osc.frequency.setValueAtTime(base*(layer===2?1.5:1),at);osc.frequency.exponentialRampToValueAtTime(Math.max(50,base*(theme==='cloud'?1.45:.5)),at+duration)
      osc.connect(gain);osc.start(at);osc.stop(at+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect()}
    }
  }
}
