import { PARK_MAP_VERSION } from '../map/park/generated/mapVersion'
import { Suspense,useRef,useState,useCallback,Component,type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping,PCFShadowMap } from 'three'
import { PreviewCamera,type PreviewView } from './PreviewCamera'
import { PreviewLight,PreviewWorld } from './PreviewWorld'
import { DRAFT_PARK,MARKERS,type SiteMarker } from './layout'
import { JumpHud } from './JumpHud'
import './layout-preview.css'

class SceneBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''}
  static getDerivedStateFromError(error:Error){return {error:error.message}}
  render(){return this.state.error?<div role="alert" className="layout-error">시안을 불러오지 못했습니다. {this.state.error}</div>:this.props.children}
}
const mainNumbers=new Set(['01','02','03','04','05','06','07','08','19','21','26','27'])
export default function LayoutPreview(){
  const [view,setView]=useState<PreviewView>('overview'),[night,setNight]=useState(false),[labels,setLabels]=useState(true)
  const [selected,setSelected]=useState<SiteMarker>(),[ready,setReady]=useState(false)
  const [resetEpoch,setResetEpoch]=useState(0)
  const markerElements=useRef(new Map<string,HTMLButtonElement>())
  const indicators=useRef<{north:HTMLSpanElement|null;scale:HTMLSpanElement|null;travel:HTMLSpanElement|null}>({north:null,scale:null,travel:null})
  const onReady=useCallback(()=>setReady(true),[])
  const resetView=(v:PreviewView)=>{setSelected(undefined);setView(v);setResetEpoch(v=>v+1)}
  return <div className="layout-app">
    <aside className="layout-sidebar" aria-label="배치 시안 시설 목록">
      <a className="layout-brand" href="/layout-preview.html"><span>온</span> ON TOP <small>PARK PLAN</small></a>
      <div className="layout-title"><div className="layout-eyebrow">REFERENCE LAYOUT · 01</div><h1>온탑 공원<br/>180m 배치 시안</h1><p>정문에서 시작해, 공원 전체를<br/>하나의 산책길로 연결합니다.</p></div>
      <div className="layout-stats"><div><b>180 × 180</b><span>공원 내부 · m</span></div><div><b>01—27</b><span>배치도 시설 번호</span></div></div>
      <div className="layout-list-heading">시설 둘러보기 <span>{MARKERS.length}</span></div>
      <nav className="layout-sites">{MARKERS.map(m=><button key={m.id} aria-pressed={selected?.id===m.id} onClick={()=>setSelected(m)}><span>{m.no}</span><strong>{m.label}</strong><i>↗</i></button>)}</nav>
      <div className="layout-sidebar-foot"><span className="layout-dot"/> FE 배치 검토용 · 서버 연결 없음<code className="layout-map-version" data-testid="preview-map-version" title={PARK_MAP_VERSION}>MAP {PARK_MAP_VERSION.slice(0,12)}</code></div>
    </aside>
    <main className="layout-stage" data-map-version={PARK_MAP_VERSION} aria-label="180m 공원 배치 미리보기">
      <SceneBoundary><Canvas shadows={{type:PCFShadowMap}} dpr={[1,1.5]} camera={{position:[-145,170,205],fov:43,near:.1,far:1400}} gl={{antialias:true,toneMapping:ACESFilmicToneMapping}}>
        <PreviewLight night={night}/>
        <Suspense fallback={null}><PreviewWorld/><PreviewCamera view={view} focus={selected} labels={labels} markerElements={markerElements} indicators={indicators} onReady={onReady} resetEpoch={resetEpoch}/></Suspense>
      </Canvas></SceneBoundary>
      <div className="layout-marker-layer">{MARKERS.filter(m=>mainNumbers.has(m.no)||m.id===selected?.id).map(m=><button key={m.id} ref={el=>{if(el)markerElements.current.set(m.id,el);else markerElements.current.delete(m.id)}} className={m.id===selected?.id?'selected':''} style={{display:'none'}} onClick={()=>setSelected(m)}><b>{m.no}</b>{m.label}</button>)}</div>
      <header className="layout-toolbar"><div className="layout-view-tabs" aria-label="보기 방식">
        <button aria-pressed={view==='overview'} onClick={()=>resetView('overview')}>조감도</button><button aria-pressed={view==='plan'} onClick={()=>resetView('plan')}>위에서 보기</button><button aria-pressed={view==='walk'} onClick={()=>resetView('walk')}>산책하기</button><button aria-pressed={view==='jump'||view==='course'} onClick={()=>resetView('jump')}>점프맵 체험</button><button aria-pressed={view==='skyline'} onClick={()=>resetView('skyline')}>남산 뷰</button>
      </div><div className="layout-options"><button aria-pressed={labels} onClick={()=>setLabels(v=>!v)}>시설명 {labels?'켜짐':'꺼짐'}</button><button aria-pressed={night} onClick={()=>setNight(v=>!v)}>{night?'☾ 야간':'☀ 주간'}</button></div></header>
      {(view==='jump'||view==='course')&&<JumpHud view={view} onView={resetView}/>}
      <div className="layout-compass"><b><span ref={el=>{indicators.current.north=el}} style={{display:'inline-block'}}>↑</span></b><span>N · 북쪽</span></div>
      {!ready&&<div className="layout-loading" role="status">공원 배치를 준비하고 있어요…</div>}
      {selected&&<section className="layout-selection" aria-label="선택한 시설"><button aria-label="시설 정보 닫기" onClick={()=>setSelected(undefined)}>×</button><span>FACILITY {selected.no}</span><h2>{selected.label}</h2><p>{selected.note}</p><dl><dt>배치 위치</dt><dd>X {selected.x}m · Z {selected.z}m</dd></dl><small>배치도 기준의 검토용 좌표입니다.</small></section>}
      <footer className="layout-hud"><div><span className="layout-dot"/><span role="status">{ready?'배치 준비 완료':'불러오는 중'}</span><i/>공원 내부만 이동 · 외곽은 배경</div><p>{view==='walk'||view==='jump'?<><kbd>W A S D</kbd> 이동 <kbd>Shift</kbd> 빠르게 · 드래그로 시점 조절<br/><span ref={el=>{indicators.current.travel=el}} role="status">산책 중 · 호수 진입로에서 수영 가능</span></>:<>{view==='plan'?'북쪽 고정 · 중심 X0 / Z0 · 휠 확대':'드래그 회전 · 휠 확대 · 시설을 선택해 가까이 보기'}</>}</p></footer>
      {view!=='walk'&&view!=='jump'&&view!=='course'&&!selected&&<div className="layout-scale"><span ref={el=>{indicators.current.scale=el}}/><b>20 m · 중앙 기준</b><small>공원 {DRAFT_PARK.size}m · 외곽 표시 약 {DRAFT_PARK.backgroundSize}m</small></div>}
    </main>
  </div>
}
