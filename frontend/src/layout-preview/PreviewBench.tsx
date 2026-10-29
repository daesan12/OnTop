import { create } from 'zustand'
import { PARK_DATA } from '../map/park'
import type { MapPose } from '../map/park/interactionData'

export const previewRingBenches=PARK_DATA.interactions.benches.filter(b=>b.id.startsWith('bench-fitness-ring-'))
export const previewBenches=PARK_DATA.interactions.benches
type Selection={benchId:string;seatIndex:0|1}
interface PreviewBenchState {
  nearby:string|null
  seated:Selection|null
  poseRequest:MapPose|null
}
// Isolated review state: never leases a real server facility or changes a session.
export const usePreviewBench=create<PreviewBenchState>(()=>({nearby:null,seated:null,poseRequest:null}))
export function resetPreviewBench(preserveApproach=false){
  usePreviewBench.setState(s=>({nearby:null,seated:null,poseRequest:preserveApproach?s.poseRequest:null}))
}
export function requestBenchApproach(id?:string){
  const bench=id?previewBenches.find(b=>b.id===id)!:previewRingBenches[3]!
  if(!bench)return
  // At the safe exported exit, look back at the bench before choosing a seat.
  usePreviewBench.setState({nearby:null,seated:null,poseRequest:{...bench.seats[0]!.exit}})
}
export function updatePreviewBenchNearby(x:number,y:number,z:number){
  if(usePreviewBench.getState().seated)return
  let nearby:string|null=null,distance=Infinity
  for(const bench of previewBenches){
    const d=Math.hypot(x-bench.position[0],z-bench.position[2])
    if(d<=bench.radius&&Math.abs(y-bench.position[1]-.8)<=bench.heightTolerance&&d<distance){distance=d;nearby=bench.id}
  }
  if(usePreviewBench.getState().nearby!==nearby)usePreviewBench.setState({nearby})
}
export function sitPreviewBench(seatIndex:0|1){
  const state=usePreviewBench.getState(),bench=previewBenches.find(b=>b.id===state.nearby)
  if(!bench||state.seated)return
  const pose=bench.seats[seatIndex]!.use
  // Model forward is +Z; the first-person camera looks along -Z.
  usePreviewBench.setState({seated:{benchId:bench.id,seatIndex},poseRequest:{...pose,yaw:pose.yaw+Math.PI}})
}
export function standPreviewBench(){
  const seated=usePreviewBench.getState().seated,bench=previewBenches.find(b=>b.id===seated?.benchId)
  if(!bench||!seated)return
  const pose=bench.seats[seated.seatIndex]!.exit
  usePreviewBench.setState({seated:null,poseRequest:{...pose,yaw:pose.yaw+Math.PI}})
}
export function PreviewBenchHud(){
  const nearby=usePreviewBench(s=>s.nearby),seated=usePreviewBench(s=>s.seated)
  if(!nearby&&!seated)return null
  const ring=(nearby??seated?.benchId??'').startsWith('bench-fitness-ring-')
  return <section className="preview-bench-controls" aria-label={ring?'원형 벤치 이용':'공원 벤치 이용'}>
    <div><strong>{seated?(ring?'원형 벤치에 앉아 있어요':'벤치에 앉아 있어요'):(ring?'나무 아래 원형 벤치':'공원 벤치')}</strong><span>{seated?'드래그로 둘러보기 · E 일어나기':'앉을 자리를 선택하세요 · E 첫 번째 자리'}</span></div>
    {seated?<button onClick={standPreviewBench}>벤치에서 일어나기 <kbd>E</kbd></button>:<div className="preview-bench-seats"><button onClick={()=>sitPreviewBench(0)}>1번 좌석에 앉기</button><button onClick={()=>sitPreviewBench(1)}>2번 좌석에 앉기</button></div>}
  </section>
}
