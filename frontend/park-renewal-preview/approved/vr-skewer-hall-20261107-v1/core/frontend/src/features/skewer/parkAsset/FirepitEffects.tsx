import {useEffect,useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {AdditiveBlending,BufferGeometry,DoubleSide,Float32BufferAttribute,ShaderMaterial,Vector3,type Group} from 'three'
import {armUnlock,effectsOutput,setFirepitAudioFocus} from '../../../../../../../../../src/audio/bgm.ts'
import {setSfxListener} from '../../../../../../../../../src/audio/sfx.ts'
import {avatars,useSession} from '../../../../../../../../../src/network/worldClient.ts'
import {cameraWorldPosition} from '../../../../../../../../../src/world/xrView.ts'
import {FIREPIT_AUDIO,firepitLevel,startFirepitVoice} from './firepitAudio'

/** Like the fountain: flowing shader silhouettes, soft particles, distance culling. */
export function FirepitEffects(){
 const root=useRef<Group>(null),voice=useRef<ReturnType<typeof startFirepitVoice>|null>(null),last=useRef(0)
 const resources=useMemo(()=>{
  const flame=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,uniforms:{time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float time;varying vec2 vUv;void main(){float pulse=.9+.065*sin(time*2.7)+.03*sin(time*6.3);float y=vUv.y/pulse;if(y>1.)discard;float x=vUv.x-.5-sin(y*7.-time*3.)*.055*y;float wave=sin(y*19.-time*5.)*.035+sin(y*11.+time*3.)*.025;float width=pow(1.-y,.8)*(.35+wave);float edge=1.-smoothstep(width-.07,width+.04,abs(x));float a=edge*smoothstep(0.,.07,y)*(1.-smoothstep(.85,1.,y));float core=1.-smoothstep(0.,width*.7,abs(x));vec3 color=mix(vec3(1.,.18,.015),vec3(1.,.82,.22),core*(1.-y*.65));gl_FragColor=vec4(color,a*.46);}`})
  const geometry=new BufferGeometry(),count=48,seeds=new Float32Array(count),positions=new Float32Array(count*3)
  for(let i=0;i<count;i++)seeds[i]=(i*.61803398875)%1
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('seed',new Float32BufferAttribute(seeds,1))
  const smoke=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},pixels:{value:700}},vertexShader:`uniform float time;uniform float pixels;attribute float seed;varying float opacity;void main(){float a=fract(time*.18+seed);vec3 p=vec3(sin(a*7.+seed*17.)*.23*a,.35+a*2.5,cos(seed*21.)*.12+sin(a*6.)*.08);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(pixels*(.12+a*.32)/-v.z,2.,80.);opacity=sin(a*3.14159)*(1.-a)*.08;}`,fragmentShader:'varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.66,.63,.59,exp(-r*r*4.)*opacity);}'})
  const sparks=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{time:{value:0},pixels:{value:700}},vertexShader:`uniform float time;uniform float pixels;attribute float seed;varying float opacity;void main(){float a=fract(time*.34+seed);vec3 p=vec3(sin(seed*44.+a*4.)*a*.35,.3+a*1.45,cos(seed*21.)*a*.24);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(pixels*.018/-v.z,1.,3.);opacity=sin(a*3.14159)*(1.-a);}`,fragmentShader:'varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(1.,.46,.08,(1.-r)*opacity);}'})
  const pool=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float time;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r*r),2.)*.14*(.9+.1*sin(time*3.));gl_FragColor=vec4(1.,.3,.045,a);}'})
  return {flame,geometry,smoke,sparks,pool,source:new Vector3(),forward:new Vector3()}
 },[])
 useEffect(()=>{armUnlock();return()=>{voice.current?.stop();voice.current=null;resources.flame.dispose();resources.geometry.dispose();resources.smoke.dispose();resources.sparks.dispose();resources.pool.dispose()}},[resources])
 useEffect(()=>()=>setFirepitAudioFocus(0),[])
 useFrame(({camera,clock,size,gl})=>{
  if(!root.current)return
  root.current.getWorldPosition(resources.source);const ear=cameraWorldPosition(camera),distance=ear.distanceTo(resources.source),time=clock.elapsedTime
  root.current.visible=distance<45
  resources.flame.uniforms.time!.value=time;resources.smoke.uniforms.time!.value=time;resources.sparks.uniforms.time!.value=time;resources.pool.uniforms.time!.value=time
  resources.smoke.uniforms.pixels!.value=size.height*gl.getPixelRatio();resources.sparks.uniforms.pixels!.value=size.height*gl.getPixelRatio()
  if(time-last.current<.05)return;last.current=time
  camera.getWorldDirection(resources.forward);setSfxListener(ear,resources.forward)
  const player=avatars.get(useSession.getState().sessionId)?.current
  const soundDistance=player?resources.source.distanceTo(player):distance
  const out=effectsOutput(),active=voice.current
  if(soundDistance>FIREPIT_AUDIO.stop&&active){active.stop();voice.current=null}
  if(out&&!voice.current&&soundDistance<FIREPIT_AUDIO.start)voice.current=startFirepitVoice(out.context,out.bus,resources.source)
  const level=out?firepitLevel(soundDistance):0;voice.current?.update(level)
  setFirepitAudioFocus(player && root.current.parent?.visible !== false ? level : 0)
  root.current.userData.audio={state:out?(voice.current?'running':'out-of-range'):'locked',distance,level}
 })
 return <group ref={root} name="vr-skewer-fire-effects" position={[-4.5,.96,5.4]}>
  {[0,Math.PI/3,-Math.PI/3].map((angle,i)=><mesh key={i} position={[0,.52,0]} rotation={[0,angle,0]} renderOrder={3}>
   <planeGeometry args={[1.1,1.04]}/><primitive object={resources.flame} attach="material" dispose={null}/>
  </mesh>)}
  <points geometry={resources.geometry} frustumCulled={false} renderOrder={4}><primitive object={resources.smoke} attach="material" dispose={null}/></points>
  <points geometry={resources.geometry} frustumCulled={false} renderOrder={5}><primitive object={resources.sparks} attach="material" dispose={null}/></points>
  <mesh position={[0,-.76,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.05,32]}/><primitive object={resources.pool} attach="material" dispose={null}/></mesh>
 </group>
}
