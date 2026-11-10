import {it,expect} from 'vitest'
import {LAKE,NODES,heightAt,onRoad,onLakeFenceBelt} from '../../src/park-renewal/plan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {lakeFenceSegments,lakeFenceOpening} from '../../src/park-renewal/lakePlan'
import {canTravel} from '../../src/park-renewal/travelMotion'
import {treePositions} from '../../src/park-renewal/landscape'
it('북쪽 호수 물가를 넓게 평탄화하고 도로 노드만 솟는 꼭짓점을 제거',()=>{for(let a=-2.9;a<-.25;a+=.08)for(const r of[.1,1,2,3,4]){const x=LAKE.x+Math.cos(a)*(LAKE.rx+r),z=LAKE.z+Math.sin(a)*(LAKE.rz+r);if(z>LAKE.z-6)continue;expect(heightAt(x,z),`${x},${z}`).toBeCloseTo(4,5)}expect(heightAt(...NODES['lake-west-north']!)).toBe(4)})
it('호숫가 울타리는 길 때문에 삭제되지 않고 코너까지 이어지며 길과 겹치지 않음',()=>{const runs=lakeFenceSegments();for(const r of runs)for(const t of[.05,.5,.95]){const x=r.a[0]+(r.z[0]-r.a[0])*t,z=r.a[1]+(r.z[1]-r.a[1])*t;expect(onRoad(x,z,.3),`${x},${z}`).toBe(false);expect(isPlantingGround(x,z)).toBe(true)}for(let a=-2.9;a<-.4;a+=.04){const x=LAKE.x+Math.cos(a)*(LAKE.rx+.9),z=LAKE.z+Math.sin(a)*(LAKE.rz+.9);if(x>76&&z< -34)continue;expect(lakeFenceOpening(x,z)).toBe(false);expect(onLakeFenceBelt(x,z)).toBe(true)}})
it('코너를 돌아가는 서쪽·전망대 옆길에서 자전거와 킥보드 차체가 통과',()=>{for(const names of[['lake-west-north','lakeCurve0','lakeCurve1','lakeCurve2','lakeCurve3','bankNorth'],['towerNorth','towerNW','tower','east-south']])for(let i=1;i<names.length;i++){const a=NODES[names[i-1]!]!,b=NODES[names[i]!]!,dx=b[0]-a[0],dz=b[1]-a[1],yaw=Math.atan2(dx,dz);for(const travel of['bicycle','scooter']as const)for(let t=0;t<.99;t+=.02){const p=[a[0]+dx*t,a[1]+dz*t]as const,q=[a[0]+dx*(t+.02),a[1]+dz*(t+.02)]as const;expect(canTravel(p,q,heightAt(...p),travel,yaw),`${names[i-1]} ${travel} ${t}`).toBe(true)}}})
it('물가 북쪽 잔디에 나무가 있고 모든 나무의 뿌리가 길을 비움',()=>{expect(treePositions.filter(([x,z])=>z< -24&&z> -62&&x>33&&x<91)).not.toHaveLength(0);for(const p of treePositions)expect(onRoad(...p,.65)).toBe(false)})
