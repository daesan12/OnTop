export const FIREPIT_AUDIO={near:2.5,far:11,start:12,stop:14} as const
export function firepitLevel(distance:number){
 const t=Math.max(0,Math.min(1,(distance-FIREPIT_AUDIO.near)/(FIREPIT_AUDIO.far-FIREPIT_AUDIO.near)))
 return (1-t*t*(3-2*t))*.34
}
/** Deterministic soft roar and short crackles; no remote file or extra audio context. */
export function firepitSamples(rate=22050,seconds=8){
 const samples=new Float32Array(Math.floor(rate*seconds));let seed=19773,low=0,pop=0,nextPop=0
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 for(let i=0;i<samples.length;i++){
  const noise=random()*2-1;low=low*.985+noise*.015
  if(i>=nextPop){pop=.3+random()*.65;nextPop=i+Math.floor(rate*(.045+random()*.23))}
  pop*=Math.exp(-1/(rate*.013));const edge=Math.min(1,i/(rate*.04),(samples.length-1-i)/(rate*.04))
  samples[i]=(low*.8+noise*.032+noise*pop*.38)*Math.max(0,edge)
 }
 return samples
}
const buffers=new WeakMap<AudioContext,AudioBuffer>()
export function startFirepitVoice(context:AudioContext,bus:AudioNode,at:{x:number;y:number;z:number}){
 let buffer=buffers.get(context)
 if(!buffer){const data=firepitSamples();buffer=context.createBuffer(1,data.length,22050);buffer.copyToChannel(data,0);buffers.set(context,buffer)}
 const source=context.createBufferSource(),gain=context.createGain(),space=context.createPanner()
 source.buffer=buffer;source.loop=true;gain.gain.value=0
 space.panningModel='HRTF';space.distanceModel='linear';space.refDistance=FIREPIT_AUDIO.near;space.maxDistance=FIREPIT_AUDIO.stop;space.rolloffFactor=0
 space.positionX.value=at.x;space.positionY.value=at.y;space.positionZ.value=at.z
 source.connect(gain).connect(space).connect(bus);source.start()
 let stopped=false
 return {context,gain,update(level:number){if(!stopped)gain.gain.setTargetAtTime(level,context.currentTime,.16)},stop(){if(stopped)return;stopped=true;gain.gain.setTargetAtTime(0,context.currentTime,.05);source.onended=()=>{source.disconnect();gain.disconnect();space.disconnect()};source.stop(context.currentTime+.3)}}
}
