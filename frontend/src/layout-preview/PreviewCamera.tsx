import { JUMP_START,JUMP_PADS,jumpReview } from './jumpCourse'
import { jumpSession,stepJump,queueJump } from './jumpSimulation'
import { enableJumpAudio } from './jumpAudio'
import { setJumpView } from './PreviewJumpCourse'
import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils,PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DRAFT_PARK,canWalk,walkHeight,MARKERS,KIOSKS,type SiteMarker } from './layout'
import { DRAFT_LAKE,swimmingAt } from './lakeLayout'
import { SWIMMING } from '../config/parkLandforms'
import { usePreviewBench,previewBenches,resetPreviewBench,updatePreviewBenchNearby,sitPreviewBench,standPreviewBench } from './PreviewBench'
import { panelOwnsKeys } from '../world/inputOwnership'
import { constructionSites,canReachConstruction,openConstructionNotice } from '../features/construction/model'

export type PreviewView='overview'|'plan'|'walk'|'skyline'|'jump'|'course'
export const previewMotion={x:DRAFT_PARK.spawn[0],z:DRAFT_PARK.spawn[1],yaw:0,pitch:0,vx:0,vz:0,ready:false,frames:0,swimming:false,mode:'overview' as PreviewView}
const projected=new Vector3()
const origin=new Vector3(),north=new Vector3(),east=new Vector3()
const labelHeight=(m:SiteMarker)=>m.no==='03'?31:m.no==='08'?23:m.no==='01'?16:m.no==='02'?10:4
const compactMarkers=new Set(['01','07','21'])
export function PreviewCamera({view,focus,labels,markerElements,indicators,onReady,resetEpoch}:{
  view:PreviewView;focus:SiteMarker|undefined;labels:boolean;resetEpoch:number;
  markerElements:RefObject<Map<string,HTMLButtonElement>>;onReady:()=>void
  indicators:RefObject<{north:HTMLSpanElement|null;scale:HTMLSpanElement|null;travel:HTMLSpanElement|null}>
}) {
  const {camera,gl,size,scene}=useThree(),keys=useRef(new Set<string>()),controls=useRef<OrbitControls|null>(null)
  useEffect(()=>{
    if(!(camera instanceof PerspectiveCamera))return
    const fit=view==='walk'||view==='jump'?1:Math.max(1,1.25*size.height/Math.max(1,size.width))
    camera.fov=MathUtils.radToDeg(2*Math.atan(Math.tan(MathUtils.degToRad(43)/2)*fit))
    camera.updateProjectionMatrix()
  },[camera,size.width,size.height,view])
  useEffect(()=>{
    previewMotion.mode=view;setJumpView(view);previewMotion.swimming=false;previewMotion.vx=0;previewMotion.vz=0;keys.current.clear();camera.rotation.order='YXZ';camera.up.set(0,1,0)
    resetPreviewBench(view==='walk')
    if(view==='jump') {
      jumpSession.x=JUMP_START.x;jumpSession.z=JUMP_START.z;jumpSession.y=0;jumpSession.vy=0;jumpSession.pad=null;jumpSession.grounded=true;jumpSession.yaw=0;jumpSession.pitch=.04;jumpSession.active=false;jumpSession.result=null;jumpSession.bufferUntil=-1e6
    } else if(view==='walk') {
      previewMotion.x=DRAFT_PARK.spawn[0];previewMotion.z=DRAFT_PARK.spawn[1];previewMotion.yaw=0;previewMotion.pitch=-.03
    } else {
      const orbit=new OrbitControls(camera,gl.domElement);controls.current=orbit
      orbit.enableRotate=view!=='plan';orbit.enablePan=view!=='plan';
      orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.minDistance=12;orbit.maxDistance=420;orbit.maxPolarAngle=Math.PI*.485
      camera.position.set(...(view==='plan'?[0,265,.001]:view==='skyline'?[30,20,-30]:view==='course'?[-105,84,92]:[0,210,220]) as [number,number,number])
      if(view==='course')orbit.target.set(0,25,-15)
      else if(view==='skyline')orbit.target.set(-250,22,250)
      else orbit.target.set(0,0,0)
      orbit.update()
    }
    return()=>{controls.current?.dispose();controls.current=null}
  },[view,camera,gl,resetEpoch])
  useEffect(()=>{
    if(!focus||view==='jump'||view==='plan')return
    if(view==='walk') {
      // Find an unobstructed approach; selecting the lake may start in swimmable water.
      resetPreviewBench()
      for(const radius of [8,13,18]) {
        let found=false
        for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1]]) {
          const x=focus.x+dx!*radius,z=focus.z+dz!*radius
          if(canWalk(x,z)) {previewMotion.x=x;previewMotion.z=z;previewMotion.yaw=Math.atan2(x-focus.x,z-focus.z);found=true;break}
        }
        if(found)break
      }
    } else if(controls.current) {
      const kiosk=KIOSKS.find(k=>focus.id===`layout-${k.kind}`)
      if(kiosk) {
        controls.current.target.set(focus.x,1.5,focus.z)
        camera.position.set(focus.x+Math.sin(kiosk.yaw)*23-Math.cos(kiosk.yaw)*8,8.5,focus.z+Math.cos(kiosk.yaw)*23+Math.sin(kiosk.yaw)*8)
        controls.current.update()
        return
      }
      const height=focus.no==='08'?35:focus.no==='03'?42:30
      const hall=focus.no==='04'||focus.no==='16'
      controls.current.target.set(hall?-61:focus.x,0,hall?-14:focus.z)
      camera.position.set(hall?-94:focus.x-25,hall?43:height,hall?32:focus.z+35)
      controls.current.update()
    }
  },[focus,view,camera])
  useEffect(()=>{
    const target=gl.domElement
    let dragging=false,lastX=0,lastY=0
    const down=(event:KeyboardEvent)=>{
      if(panelOwnsKeys())return
      if(event.target instanceof HTMLElement&&(event.target.matches('input,textarea')||event.target.isContentEditable))return
      if(view==='walk'&&event.code==='KeyE'&&!event.repeat){
        event.preventDefault()
        const p={x:previewMotion.x,y:walkHeight(previewMotion.x,previewMotion.z)+.8,z:previewMotion.z}
        const construction=constructionSites.find(s=>canReachConstruction(p,s.id))
        if(usePreviewBench.getState().seated)standPreviewBench();else if(construction)openConstructionNotice(construction.id);else sitPreviewBench(0)
        return
      }
      if(view==='jump'&&event.code==='Space'){event.preventDefault();if(!event.repeat&&!jumpSession.manual){queueJump(jumpSession);enableJumpAudio()}return}
      if((view==='walk'||view==='jump')&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)) {
        event.preventDefault();keys.current.add(event.code);if(view==='jump')enableJumpAudio()
      }
    }
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code)
    const clear=()=>{keys.current.clear();dragging=false}
    const pointerDown=(event:PointerEvent)=>{if(view==='walk'||view==='jump'){dragging=true;lastX=event.clientX;lastY=event.clientY;target.setPointerCapture(event.pointerId)}}
    const pointerMove=(event:PointerEvent)=>{if(!dragging)return;if(view==='jump'){jumpSession.yaw-=(event.clientX-lastX)*.004;jumpSession.pitch=MathUtils.clamp(jumpSession.pitch-(event.clientY-lastY)*.004,-1.35,1.25);lastX=event.clientX;lastY=event.clientY;return}previewMotion.yaw-=(event.clientX-lastX)*.004;previewMotion.pitch=MathUtils.clamp(previewMotion.pitch-(event.clientY-lastY)*.004,-1.2,1.15);lastX=event.clientX;lastY=event.clientY}
    const pointerUp=()=>{dragging=false}
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);window.addEventListener('ontop-clear-input',clear)
    target.addEventListener('pointerdown',pointerDown);target.addEventListener('pointermove',pointerMove);target.addEventListener('pointerup',pointerUp);target.addEventListener('pointercancel',clear)
    return()=>{clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);window.removeEventListener('ontop-clear-input',clear);target.removeEventListener('pointerdown',pointerDown);target.removeEventListener('pointermove',pointerMove);target.removeEventListener('pointerup',pointerUp);target.removeEventListener('pointercancel',clear)}
  },[view,gl])
  const started=useRef(false),reviewRevision=useRef(-1)
  useFrame((_,delta)=>{
    if(view==='course'&&controls.current&&reviewRevision.current!==jumpReview.revision) {
      reviewRevision.current=jumpReview.revision
      const points=JUMP_PADS.filter(p=>p.stage===jumpReview.stage)
      if(points.length){const mid=points[Math.floor(points.length/2)]!;controls.current.target.set(mid.x,mid.height-2,mid.z);camera.position.set(mid.x-16,mid.height+14,mid.z+20);controls.current.update()}
    }
    if(view==='jump') {
      const forward=Number(keys.current.has('KeyW')||keys.current.has('ArrowUp'))-Number(keys.current.has('KeyS')||keys.current.has('ArrowDown'))
      const right=Number(keys.current.has('KeyD')||keys.current.has('ArrowRight'))-Number(keys.current.has('KeyA')||keys.current.has('ArrowLeft'))
      const yaw=jumpSession.yaw
      stepJump(jumpSession,delta,{x:-Math.sin(yaw)*forward+Math.cos(yaw)*right,z:-Math.cos(yaw)*forward-Math.sin(yaw)*right,fast:keys.current.has('ShiftLeft')||keys.current.has('ShiftRight')})
      camera.position.set(jumpSession.x,jumpSession.y+(jumpSession.swimming?.72:1.56),jumpSession.z);camera.rotation.set(jumpSession.pitch,jumpSession.yaw,0)
      previewMotion.x=jumpSession.x;previewMotion.z=jumpSession.z;previewMotion.vx=jumpSession.vx;previewMotion.vz=jumpSession.vz
    } else if(view==='walk') {
      const request=usePreviewBench.getState().poseRequest
      if(request){
        previewMotion.x=request.x;previewMotion.z=request.z;previewMotion.yaw=request.yaw;previewMotion.pitch=-.03;keys.current.clear()
        usePreviewBench.setState({poseRequest:null})
      }
      const seated=usePreviewBench.getState().seated
      const seat=seated?previewBenches.find(b=>b.id===seated.benchId)!.seats[seated.seatIndex]!.use:null
      const pressed=(...codes:string[])=>codes.some(code=>keys.current.has(code))
      let forward=Number(pressed('KeyW','ArrowUp'))-Number(pressed('KeyS','ArrowDown'))
      let right=Number(pressed('KeyD','ArrowRight'))-Number(pressed('KeyA','ArrowLeft'))
      const length=Math.hypot(forward,right)||1;forward/=length;right/=length
      const swimming=swimmingAt(previewMotion.x,previewMotion.z),fast=pressed('ShiftLeft','ShiftRight')
      const distance=seat||panelOwnsKeys()?0:Math.min(delta,.04)*(swimming?(fast?SWIMMING.fastSpeed:SWIMMING.speed):(fast?10:6))
      const dx=(-Math.sin(previewMotion.yaw)*forward+Math.cos(previewMotion.yaw)*right)*distance
      const dz=(-Math.cos(previewMotion.yaw)*forward-Math.sin(previewMotion.yaw)*right)*distance
      previewMotion.vx=0;previewMotion.vz=0
      if(canWalk(previewMotion.x+dx,previewMotion.z)){previewMotion.x+=dx;previewMotion.vx=dx/Math.max(.001,Math.min(delta,.04))}
      if(canWalk(previewMotion.x,previewMotion.z+dz)){previewMotion.z+=dz;previewMotion.vz=dz/Math.max(.001,Math.min(delta,.04))}
      previewMotion.swimming=swimmingAt(previewMotion.x,previewMotion.z)
      if(seat){previewMotion.x=seat.x;previewMotion.z=seat.z;previewMotion.swimming=false}
      updatePreviewBenchNearby(previewMotion.x,walkHeight(previewMotion.x,previewMotion.z)+.8,previewMotion.z)
      const eye=seat?seat.y+.55:previewMotion.swimming?DRAFT_LAKE.surfaceY+SWIMMING.floatOffset+.72:walkHeight(previewMotion.x,previewMotion.z)+1.65
      camera.position.set(previewMotion.x,eye,previewMotion.z)
      camera.rotation.set(previewMotion.pitch,previewMotion.yaw,0)
    } else controls.current?.update()
    const center=scene.getObjectByName('pavilion-P0')
    if(center&&!started.current) {started.current=true;previewMotion.ready=true;onReady()}
    previewMotion.frames++
    if(indicators.current.travel) {
      const text=usePreviewBench.getState().seated?'벤치에 앉아 쉬는 중 · E 일어나기':previewMotion.swimming?'수영 중 · Shift 빠르게':'산책 중 · 호수 진입로에서 수영 가능'
      if(indicators.current.travel.textContent!==text)indicators.current.travel.textContent=text
    }
    origin.set(0,0,0).project(camera);north.set(0,0,-20).project(camera);east.set(20,0,0).project(camera)
    if(indicators.current.north)indicators.current.north.style.transform=`rotate(${Math.atan2((north.x-origin.x)*size.width,(north.y-origin.y)*size.height)}rad)`
    if(indicators.current.scale)indicators.current.scale.style.width=`${Math.hypot((east.x-origin.x)*size.width/2,(east.y-origin.y)*size.height/2)}px`
    for(const marker of MARKERS) {
      const element=markerElements.current.get(marker.id);if(!element)continue
      projected.set(marker.x,labelHeight(marker),marker.z).project(camera)
      const visible=labels&&projected.z<1&&projected.z>-1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1
        &&(size.width>=560||compactMarkers.has(marker.no)||focus?.id===marker.id)
        &&(view!=='walk'||Math.hypot(marker.x-previewMotion.x,marker.z-previewMotion.z)<45)
      element.style.display=visible?'':'none'
      element.style.transform=`translate(${(projected.x*.5+.5)*size.width}px,${(-projected.y*.5+.5)*size.height}px) translate(-50%,-100%)`
    }
  })
  return null
}
