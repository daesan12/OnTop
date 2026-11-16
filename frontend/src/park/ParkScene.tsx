import { Component, Suspense, lazy, useCallback, useState, type ReactNode } from 'react'
import type { QualityPreset } from '../config'
import { loadWorldCanvas } from './loadWorldCanvas'
const WorldCanvas = lazy(() => loadWorldCanvas().then(module => ({ default: module.WorldCanvas })))

class SceneBoundary extends Component<{children:ReactNode},{error:string}> {
  state = {error:''}
  static getDerivedStateFromError(error:Error){return {error:error.message}}
  render(){return this.state.error ? <div className="park-scene-message" role="alert">3D 화면을 열지 못했습니다. WebGL 2와 하드웨어 가속을 확인해주세요.<button onClick={()=>this.setState({error:''})}>다시 열기</button></div>:this.props.children}
}
export function ParkScene({quality,active=true}:{quality:QualityPreset;active?:boolean}) {
  const [ready,setReady]=useState(false)
  const onReady=useCallback(()=>setReady(true),[])
  const preparingGate = !ready
  return <div className={`park-scene park-scene--live${preparingGate ? ' park-scene--preparing-gate' : ''}`} aria-label="3D 공원">
    <SceneBoundary><Suspense fallback={null}><WorldCanvas quality={quality} active={active} onReady={onReady}/></Suspense>
      {!ready&&<div className="park-scene-message" role="status">공원을 준비하고 있어요…</div>}
    </SceneBoundary>
  </div>
}
