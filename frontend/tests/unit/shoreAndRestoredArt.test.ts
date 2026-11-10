import {expect,it} from 'vitest'
import {LAKE,heightAt,NODES,NODE_HEIGHTS,distanceToSegment,EDGES} from '../../src/park-renewal/plan'
import {isPlantingGround,onLand} from '../../src/park-renewal/groundPlan'
it('물가 선반은 수면으로 꺼지지 않으며 다리의 높은 육지 접속부만 기존 높이를 유지',()=>{
 for(let i=0;i<720;i++)for(const offset of [.01,.15,.35,.5]){
  const a=i/720*Math.PI*2,x=LAKE.x+Math.cos(a)*(LAKE.rx+offset),z=LAKE.z+Math.sin(a)*(LAKE.rz+offset)
  expect(heightAt(x,z),`${x},${z}`).toBeGreaterThanOrEqual(4)
  const raisedBridgeApproach=distanceToSegment(x,z,NODES.bankSouth!,NODES.bankNorth!)<12
  expect(heightAt(x,z),`${x},${z}`).toBeLessThanOrEqual(raisedBridgeApproach?Math.max(...['bridge-bank','bankSouth','bankNorth'].map(n=>NODE_HEIGHTS[n]!))+.01:4.21)
 }
},15000)
it('광장과 분수 접속길은 7m 돌길이며 중앙 구간에 잔디가 끊고 들어오지 않음',()=>{
 const a=NODES.eastCluster!,b=NODES.fountainGate!
 expect(EDGES.some(([x,y,w])=>x==='eastCluster'&&y==='fountainGate'&&w===7)).toBe(true)
 for(let i=0;i<=40;i++){const t=i/40,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;expect(onLand(x,z)).toBe(true);expect(isPlantingGround(x,z)).toBe(false)}
})
