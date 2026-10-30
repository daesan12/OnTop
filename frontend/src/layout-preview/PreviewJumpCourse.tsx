import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { useSurfaceMaps } from '../world/art/SurfaceMaterial'
import { useLayoutEffect,useMemo,useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector2,Color,InstancedBufferAttribute,MeshStandardMaterial,Object3D,type InstancedMesh,type Mesh } from 'three'
import type { PropBuilder } from '../world/art/propGeometry'
import { JUMP_PADS,JUMP_GATES,JUMP_START,JUMP_STAGES,type JumpPad,type JumpTheme } from './jumpCourse'
import { jumpArt,jumpStartArt,jumpFinishArt,jumpParticleGeometry } from './jumpGeometry'
import { jumpReturnRoute } from './jumpNavigation'
import { walkHeight } from './layout'
import { jumpSession } from './jumpSimulation'
import { playJumpSound } from './jumpAudio'
import { applyLandingMotion, landingGeometry } from '../features/jumpmap/landingMotion'

const pulse={time:0,view:'overview'},object=new Object3D(),color=new Color()
export const jumpVisualState={hits:0,lastTheme:'',soundLayers:0}
export function setJumpView(view:string){pulse.view=view}
function materialFor(theme:JumpTheme,finish:string,stone:ReturnType<typeof useSurfaceMaps>,wood:ReturnType<typeof useSurfaceMaps>) {
  const surface=finish==='wood'||theme==='fish'||theme==='kite'||theme==='lantern'?wood:stone,normal=theme==='cloud'?.055:theme==='gomoku'?.12:theme==='stone'?.35:.18
  const material=new MeshStandardMaterial({transparent:true,depthWrite:false,vertexColors:true,map:!SIMPLE_MAP&&(finish==='stone'||finish==='wood')?surface.map:null,normalMap:SIMPLE_MAP?null:surface.normalMap,normalScale:new Vector2(normal,normal),roughnessMap:SIMPLE_MAP?null:surface.roughnessMap,roughness:finish==='gold'?.58:theme==='gomoku'?.26:theme==='cloud'||theme==='kite'?.96:theme==='lily'?.45:.85,metalness:finish==='gold'?.75:0})
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`attribute float aFade;varying float vFade;\n${shader.vertexShader}`
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vFade=aFade;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec3 jumpTint=diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb=mix(jumpTint,diffuseColor.rgb,.42);')
    shader.fragmentShader=`varying float vFade;\n${shader.fragmentShader}`
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.a*=vFade;
    `)
    if(finish==='glow')shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight+=diffuseColor.rgb*.45;\n#include <opaque_fragment>')
  }
  applyLandingMotion(material,theme,{get value(){return pulse.time}},false)
  material.customProgramCacheKey=()=>`preview-jump-${theme}-${finish}-tactile-v4`
  return material
}
function ThemeBatch({theme,pads}:{theme:JumpTheme;pads:readonly JumpPad[]}) {
  const stone=useSurfaceMaps('stone'),wood=useSurfaceMaps('wood')
  const meshes=useRef<InstancedMesh[]>([]),lastHit=useRef(0)
  const batches=useMemo(()=>Object.entries(jumpArt[theme]).map(([kind,g])=>{
    const geometry=landingGeometry(g,theme);geometry.setAttribute('aFade',new InstancedBufferAttribute(new Float32Array(pads.length).fill(1),1));geometry.setAttribute('aHit',new InstancedBufferAttribute(new Float32Array(pads.length).fill(-1000),1))
    return {kind,geometry,material:materialFor(theme,kind,stone,wood)}
  }),[theme,pads,stone,wood])
  useLayoutEffect(()=>{
    meshes.current.forEach(mesh=>{
      pads.forEach((p,i)=>{object.position.set(p.x,p.height,p.z);object.rotation.set(0,p.yaw,0);object.scale.set(1,1,1);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);mesh.setColorAt(i,color.set(theme==='gomoku'&&p.ordinal%2?'#171a1c':'#ffffff'))})
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere()
    })
    return()=>batches.forEach(b=>{b.geometry.dispose();b.material.dispose()})
  },[pads,batches,theme])
  useFrame((_,dt)=>{
    const latest=jumpSession.hits.filter(h=>h.id>lastHit.current)
    for(const mesh of meshes.current) {
      const fade=mesh.geometry.getAttribute('aFade') as InstancedBufferAttribute,hit=mesh.geometry.getAttribute('aHit') as InstancedBufferAttribute
      pads.forEach((p,i)=>{
        let target=pulse.view==='course'?.5:.18
        if(jumpSession.active&&pulse.view==='jump'){const d=p.height-jumpSession.y;target=.85-.67*Math.min(1,Math.max(0,d>12?(d-12)/4:d< -8?(-8-d)/4:0))}
        if(pulse.view==='jump'&&jumpSession.pad?.id===p.id)target=Math.max(.6,target)
        fade.setX(i,fade.getX(i)+(target-fade.getX(i))*Math.min(1,dt*6))
        for(const h of latest)if(h.pad.id===p.id)hit.setX(i,pulse.time)
      })
      fade.needsUpdate=true;if(latest.length)hit.needsUpdate=true
    }
    if(latest.length)lastHit.current=latest.at(-1)!.id
  })
  return <group name={`layout-jump-theme-${theme}`}>{batches.map((b,i)=><instancedMesh key={b.kind} ref={m=>{if(m)meshes.current[i]=m}} args={[b.geometry,b.material,pads.length]} name={`layout-jump-${theme}-${b.kind}`} receiveShadow/>)}</group>
}
function GhostArt({art,name}:{art:ReturnType<PropBuilder['finish']>;name:string}) {
  const stone=useSurfaceMaps('stone'),wood=useSurfaceMaps('wood')
  const meshes=useRef<InstancedMesh[]>([])
  const batches=useMemo(()=>Object.entries(art).map(([kind,g])=>{
    const geometry=g.clone();geometry.setAttribute('aFade',new InstancedBufferAttribute(new Float32Array([.18]),1));geometry.setAttribute('aHit',new InstancedBufferAttribute(new Float32Array([-1000]),1))
    return {kind,geometry,material:materialFor('gate',kind,stone,wood)}
  }),[art,stone,wood])
  useLayoutEffect(()=>{object.position.set(0,0,0);object.rotation.set(0,0,0);object.scale.set(1,1,1);object.updateMatrix();meshes.current.forEach(m=>{m.setMatrixAt(0,object.matrix);m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere()});return()=>batches.forEach(b=>{b.geometry.dispose();b.material.dispose()})},[batches])
  useFrame((_,dt)=>{for(const m of meshes.current){const f=m.geometry.getAttribute('aFade') as InstancedBufferAttribute,target=pulse.view==='course'?.5:jumpSession.active&&pulse.view==='jump'?.65:.18;f.setX(0,f.getX(0)+(target-f.getX(0))*Math.min(1,dt*6));f.needsUpdate=true}})
  return <group name={name}>{batches.map((b,i)=><instancedMesh key={b.kind} ref={m=>{if(m)meshes.current[i]=m}} args={[b.geometry,b.material,1]}/>)}</group>
}
const themes=[...JUMP_STAGES.map(s=>s.theme),'gate' as const]
const batches=themes.map(theme=>({theme,pads:[...JUMP_PADS,...JUMP_GATES].filter(p=>p.theme===theme)}))
const particles=Array.from({length:192},()=>({life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,color:'#d8cfac'}))
const rings=Array.from({length:12},()=>({age:99,x:0,y:0,z:0,color:'#c6dfc2'}))
let particleCursor=0,ringCursor=0
function JumpEffects() {
  const particleMesh=useRef<InstancedMesh>(null),ringMeshes=useRef<Mesh[]>([]),last=useRef(0)
  useFrame((_,dt)=>{
    pulse.time=performance.now()/1000
    for(const h of jumpSession.hits)if(h.id>last.current) {
      jumpVisualState.hits++;jumpVisualState.lastTheme=h.pad.theme
      if(!jumpSession.muted)jumpVisualState.soundLayers+=3
      playJumpSound(h,jumpSession.muted)
      const p=h.pad,water=p.theme==='lily',glow=p.theme==='lantern'||p.theme==='gate'
      Object.assign(rings[ringCursor++%rings.length]!,{age:0,x:p.x,y:p.height+.025,z:p.z,color:water?'#bfe6ff':glow?'#ffdc81':'#d9dfc0'})
      for(let i=0;i<(h.pad.id==='layout-jump-finish-splash'?36:water?12:8);i++) {
        const a=i*2.39996
        Object.assign(particles[particleCursor++%particles.length]!,{life:.5+i%3*.12,x:p.x+Math.cos(a)*.45,y:p.height+.06,z:p.z+Math.sin(a)*.45,vx:Math.cos(a)*1.3,vy:1.2+i%4*.3,vz:Math.sin(a)*1.3,color:water?'#bfe6ff':glow?'#e3b752':p.theme==='fish'?'#692a21':'#d8d0bc'})
      }
      last.current=h.id
    }
    particles.forEach((p,i)=>{
      p.life-=dt;p.vy-=dt*12;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt
      object.position.set(p.x,p.y,p.z);object.scale.setScalar(p.life>0?Math.min(1,p.life*4):0);object.updateMatrix();particleMesh.current!.setMatrixAt(i,object.matrix);particleMesh.current!.setColorAt(i,color.set(p.color))
    })
    particleMesh.current!.instanceMatrix.needsUpdate=true;particleMesh.current!.instanceColor!.needsUpdate=true
    rings.forEach((r,i)=>{r.age+=dt;const mesh=ringMeshes.current[i]!;mesh.visible=r.age<.65;mesh.position.set(r.x,r.y,r.z);mesh.scale.setScalar(1+r.age*2.6);const m=mesh.material as MeshStandardMaterial;m.opacity=Math.max(0,.55*(1-r.age/.65));m.color.set(r.color)})
  })
  return <group name="layout-jump-landing-effects">
    <instancedMesh ref={particleMesh} args={[jumpParticleGeometry,undefined,particles.length]} frustumCulled={false}><meshBasicMaterial/></instancedMesh>
    {rings.map((_,i)=><mesh key={i} ref={m=>{if(m)ringMeshes.current[i]=m}} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.78,.98,32]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>)}
  </group>
}
function ReturnArrows() {
  const ref=useRef<InstancedMesh>(null)
  useFrame(()=>{
    const mesh=ref.current!;mesh.visible=jumpSession.navigate&&pulse.view==='jump'
    let index=0
    const points=jumpReturnRoute.points
    for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),steps=Math.ceil(length/3)
      for(let j=0;j<steps&&index<96;j++) {
        const t=(j+.5)/steps,x=a.x+dx*t,z=a.z+dz*t
        if(Math.hypot(x-jumpSession.x,z-jumpSession.z)<1)continue
        object.position.set(x,Math.max(.08,walkHeight(x,z)+.09),z);object.rotation.set(Math.PI/2,0,-Math.atan2(dx,dz));object.scale.set(1,1,.3);object.updateMatrix();mesh.setMatrixAt(index++,object.matrix)
      }
    }
    mesh.count=index;mesh.instanceMatrix.needsUpdate=true
  })
  return <instancedMesh name="layout-jump-return-arrows" ref={ref} args={[undefined,undefined,96]} frustumCulled={false}><coneGeometry args={[.23,.65,3]}/><meshBasicMaterial color="#d6af58"/></instancedMesh>
}
export function PreviewJumpCourse(){return <group name="layout-vr-jump-course">
  {batches.map(b=><ThemeBatch key={b.theme} {...b}/>)}
  {[...JUMP_PADS,...JUMP_GATES].map(p=><group key={p.id} name={p.id} position={[p.x,p.height-p.thickness/2,p.z]} userData={{stage:p.stage,top:p.height,theme:p.theme}}/>)}
  <group name="layout-jump-start" position={[JUMP_START.x,.11,JUMP_START.z]}><GhostArt art={jumpStartArt} name="jump-start-coin-paving"/></group>
  <GhostArt art={jumpFinishArt} name="layout-jump-finish-dive"/>
  <JumpEffects/>
  <ReturnArrows/>
</group>}
