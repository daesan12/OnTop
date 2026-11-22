import {PropBuilder} from '../src/world/art/propGeometry'
import {guardRailGeometry} from './guardLayout'
import {FITNESS_FENCE,fitnessFenceSegments} from './motionPlan'
import {heightAt} from './plan'

type FencePoint = [number,number,number]

/** 출입구와 충돌 선분은 그대로 두고 공유 기둥과 난간 이음면만 한 번 생성한다. */
export function buildFitnessFence(){
 const builder=new PropBuilder(),posts=new Set<string>(),paths:FencePoint[][]=[]
 const capHeight=.1,postHeight=FITNESS_FENCE.height-capHeight
 for(const {a,z} of fitnessFenceSegments()){
  const start:FencePoint=[a[0],heightAt(...a),a[1]],end:FencePoint=[z[0],heightAt(...z),z[1]]
  for(const [x,y,depth] of [start,end]){
   const key=[x,y,depth].map(value=>value.toFixed(6)).join(',')
   if(posts.has(key))continue
   posts.add(key)
   builder.box('wood','#785f3e',[x,y+postHeight/2,depth],[.16,postHeight,.16])
   builder.box('tile','#46584b',[x,y+postHeight+capHeight/2,depth],[.25,capHeight,.25])
  }
  const path=paths.at(-1),last=path?.at(-1)
  if(last&&Math.hypot(last[0]-start[0],last[1]-start[1],last[2]-start[2])<1e-6)path!.push(end)
  else paths.push([start,end])
 }
 // 상단 목재와 기와 덮개의 윗면이 같은 높이에서 겹치지 않게 덮개 아래로 연결한다.
 for(const height of [.42,FITNESS_FENCE.height-capHeight-.05]){
  builder.add('wood',guardRailGeometry(paths,height),'#a18862')
 }
 return builder.finish()
}
