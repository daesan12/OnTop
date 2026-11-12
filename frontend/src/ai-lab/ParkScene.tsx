import { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Group, PCFShadowMap, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CharacterModel } from './CharacterModel'
import { approachAngle, headingToward, modelRole, smoothFactor, type CameraMode } from './sceneMath'
import type { Npc, State, Visitor } from './api'
import './scene.css'

type Props = { state: State; selected: string; author: string; onSelect: (id: string) => void; onBoard: () => void; onFeedback: () => void; onWalk: (x: number, z: number) => void }
type LabelMap = Map<string, HTMLDivElement>

export function ParkScene(props: Props) {
  const [mode, setMode] = useState<CameraMode>('overview'), [ready, setReady] = useState(false)
  const [routes, setRoutes] = useState(false)
  const labels = useMemo<LabelMap>(() => new Map(), [])
  return <div className="lab-scene-wrap">
    <div className="scene-toolbar"><div className="camera-buttons" aria-label="3D 카메라"><button className={mode === 'overview' ? 'active' : ''} onClick={() => setMode('overview')}>전체 보기</button><button className={mode === 'follow' ? 'active' : ''} onClick={() => setMode('follow')}>NPC 따라보기</button><button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}>오목판 보기</button></div><label className="check"><input type="checkbox" checked={routes} onChange={e => setRoutes(e.target.checked)}/>경유지</label></div>
    <SceneBoundary><div className="lab-scene" data-testid="ai-park-3d" data-renderer={ready ? 'ready' : 'loading'}>
      <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [42, 34, 43], fov: 40, near: .1, far: 150 }}
        gl={{ antialias: true, powerPreference: 'low-power' }} fallback={<p className="scene-fallback">이 브라우저는 WebGL을 지원하지 않습니다. 위의 2D 지도 버튼으로 전환해주세요.</p>}>
        <color attach="background" args={['#e8eee4']}/><fog attach="fog" args={['#e8eee4', 65, 130]}/>
        <hemisphereLight args={['#fff8e7', '#61744d', 2.3]}/>
        <directionalLight position={[12, 28, 16]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-normalBias={.04}/>
        <ParkTerrain onBoard={props.onBoard} onFeedback={props.onFeedback} onWalk={props.onWalk} board={props.state.game.board.board}/>
        {routes && props.state.route.map((point, i) => <mesh key={i} position={[point.x, .04, point.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.18, .27, 20]}/><meshBasicMaterial color="#bd8445"/></mesh>)}
        {props.state.npcs.map(npc => <NpcActor key={npc.id} npc={npc} selected={npc.id === props.selected} now={props.state.now} labels={labels} onSelect={props.onSelect}/>)}
        {(props.state.visitors ?? []).map(visitor => <VisitorActor key={visitor.author} visitor={visitor} own={visitor.author === props.author} labels={labels}/>)}
        <CameraRig mode={mode} setMode={setMode} selected={props.state.npcs.find(n => n.id === props.selected)} onReady={() => setReady(true)}/>
      </Canvas>
      <div className="scene-labels">{props.state.npcs.map(npc => <div key={npc.id} ref={element => { if (element) labels.set(npc.id, element); else labels.delete(npc.id) }} className="scene-person-label scene-npc-label" data-npc-id={npc.id}>
        {npc.speechUntil > props.state.now && <div className="scene-bubble" role="status">{npc.speech}</div>}
        <button onClick={() => props.onSelect(npc.id)} className={npc.id === props.selected ? 'selected' : ''}>{npc.name}<small>{npc.action === 'TALK' ? '대화 중' : npc.action === 'WATCH_OMOK' ? '오목 구경' : npc.action === 'RESPOND_TO_VIOLATION' ? '현장 방문' : '순찰 중'}</small></button>
      </div>)}{(props.state.visitors ?? []).map(visitor => <div key={`v:${visitor.author}`} ref={element => { if (element) labels.set(`v:${visitor.author}`, element); else labels.delete(`v:${visitor.author}`) }} className="scene-person-label scene-visitor-label"><span>{visitor.author}{visitor.author === props.author ? ' · 나' : ''}</span></div>)}</div>
      <div className="scene-status" aria-live="polite">{ready ? '3D 장면 준비됨' : '3D 장면 준비 중…'}</div>
    </div></SceneBoundary>
    <p className="scene-help">드래그: 시점 회전 · 휠: 확대 · 산책로 클릭: 이동 · NPC: 선택 · 오목판/소리함: 해당 영역 열기</p>
  </div>
}

function VisitorActor({ visitor, own, labels }: { visitor: Visitor; own: boolean; labels: LabelMap }) {
  const root = useRef<Group>(null), initial = useRef<[number, number, number]>([visitor.x, .05, visitor.z])
  const previous = useRef({ x: visitor.x, z: visitor.z }), yaw = useRef(0), anchor = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }, delta) => {
    const actor = root.current
    if (!actor) return
    const dx = visitor.x - previous.current.x, dz = visitor.z - previous.current.z, factor = smoothFactor(delta)
    if (Math.hypot(dx, dz) > .015) { yaw.current = headingToward(dx, dz, yaw.current); previous.current = { x: visitor.x, z: visitor.z } }
    actor.position.x += (visitor.x - actor.position.x) * factor; actor.position.z += (visitor.z - actor.position.z) * factor
    actor.rotation.y = approachAngle(actor.rotation.y, yaw.current, factor)
    const label = labels.get(`v:${visitor.author}`)
    if (label) {
      anchor.set(actor.position.x, 2.8, actor.position.z).project(camera)
      label.style.visibility = anchor.z < -1 || anchor.z > 1 ? 'hidden' : 'visible'
      label.style.transform = `translate(${(anchor.x*.5+.5)*size.width}px,${(-anchor.y*.5+.5)*size.height}px) translate(-50%,-100%)`
    }
  })
  return <group ref={root} position={initial.current} scale={1.1}><CharacterModel role="VISITOR" moving={visitor.moving} talking={false} selected={own} color={own ? '#bb744f' : '#7f739d'}/></group>
}

function NpcActor({ npc, selected, now, labels, onSelect }: { npc: Npc; selected: boolean; now: number; labels: LabelMap; onSelect: (id: string) => void }) {
  const root = useRef<Group>(null), previous = useRef({ x: npc.x, z: npc.z }), speed = useRef(0)
  const initial = useRef<[number, number, number]>([npc.x, .05, npc.z]), yaw = useRef(0)
  const [moving, setMoving] = useState(false)
  const anchor = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }, delta) => {
    const actor = root.current
    if (!actor) return
    const dx = npc.x - previous.current.x, dz = npc.z - previous.current.z
    const walking = Math.hypot(npc.x - actor.position.x, npc.z - actor.position.z) > .035 && npc.action !== 'TALK'
    if (walking !== (speed.current > 0)) { speed.current = walking ? 1 : 0; setMoving(walking) }
    const factor = smoothFactor(delta)
    actor.position.x += (npc.x - actor.position.x) * factor; actor.position.z += (npc.z - actor.position.z) * factor
    if (Math.hypot(dx, dz) > .015) yaw.current = headingToward(dx, dz, actor.rotation.y)
    else if (!walking && npc.action === 'WATCH_OMOK') yaw.current = Math.PI
    actor.rotation.y = approachAngle(actor.rotation.y, yaw.current, factor)
    // Keep the last received target until a new snapshot arrives; facing must not reset every animation frame.
    if (Math.hypot(dx, dz) > .015) previous.current = { x: npc.x, z: npc.z }
    const label = labels.get(npc.id)
    if (label) {
      anchor.set(actor.position.x, 3.05, actor.position.z).project(camera)
      label.style.visibility = anchor.z < -1 || anchor.z > 1 ? 'hidden' : 'visible'
      label.style.transform = `translate(${(anchor.x * .5 + .5) * size.width}px,${(-anchor.y * .5 + .5) * size.height}px) translate(-50%,-100%)`
    }
  })
  return <group ref={root} position={initial.current} scale={1.25} onClick={event => { event.stopPropagation(); onSelect(npc.id) }}>
    <CharacterModel role={modelRole(npc.role, npc.id)} moving={moving} talking={npc.action === 'TALK' || npc.speechUntil > now} selected={selected}/>
  </group>
}

function CameraRig({ mode, setMode, selected, onReady }: { mode: CameraMode; setMode: (mode: CameraMode) => void; selected?: Npc; onReady: () => void }) {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControls | null>(null), transition = useRef(true), reported = useRef(false)
  const target = useMemo(() => new Vector3(), []), location = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.target.set(16, 0, 11); orbit.enableDamping = true; orbit.dampingFactor = .09
    orbit.minDistance = 9; orbit.maxDistance = 65; orbit.minPolarAngle = .18; orbit.maxPolarAngle = Math.PI * .47
    orbit.enablePan = false
    const manual = () => { transition.current = false; setMode('free') }
    orbit.addEventListener('start', manual); controls.current = orbit; orbit.update()
    return () => { orbit.removeEventListener('start', manual); orbit.dispose(); controls.current = null }
  }, [camera, gl, setMode])
  useEffect(() => { transition.current = true }, [mode])
  useFrame((_, delta) => {
    const orbit = controls.current
    if (!orbit) return
    if (!reported.current) { reported.current = true; requestAnimationFrame(onReady) }
    if (mode !== 'free' && (transition.current || mode === 'follow')) {
      if (mode === 'follow' && selected) { target.set(selected.x, 1.1, selected.z); location.set(selected.x + 9, 10, selected.z + 12) }
      else if (mode === 'board') { target.set(16, .4, 2); location.set(23, 15, 14) }
      else { target.set(16, 0, 11); location.set(42, 34, 43) }
      const alpha = smoothFactor(delta, 5)
      camera.position.lerp(location, alpha); orbit.target.lerp(target, alpha)
      if (camera.position.distanceTo(location) < .05) transition.current = false
    }
    orbit.update()
  })
  return null
}

function Box({ at, size, color, shadow = true }: { at: [number, number, number]; size: [number, number, number]; color: string; shadow?: boolean }) {
  return <mesh position={at} castShadow={shadow} receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.9}/></mesh>
}
function Tree({ x, z, tone = '#7c9a65' }: { x: number; z: number; tone?: string }) {
  return <group position={[x, 0, z]}><mesh position={[0, 1.1, 0]} castShadow><cylinderGeometry args={[.19, .26, 2.2, 6]}/><meshStandardMaterial color="#927657"/></mesh><mesh position={[0, 2.9, 0]} castShadow><icosahedronGeometry args={[1.5, 1]}/><meshStandardMaterial color={tone} flatShading/></mesh><mesh position={[.65, 2.4, .15]} castShadow><icosahedronGeometry args={[.9, 0]}/><meshStandardMaterial color="#8ea779" flatShading/></mesh></group>
}
function Bench({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}><Box at={[0, .65, 0]} size={[2.3, .15, .65]} color="#b68e61"/><Box at={[0, 1.1, -.3]} size={[2.3, .65, .12]} color="#a77b52"/>{[-.85, .85].map(dx => <Box key={dx} at={[dx, .32, 0]} size={[.12, .6, .6]} color="#5b6653"/>)}</group>
}
function ParkTerrain({ onBoard, onFeedback, onWalk, board }: { onBoard: () => void; onFeedback: () => void; onWalk: (x: number, z: number) => void; board: number[][] }) {
  return <group>
    <Box at={[16, -.32, 11]} size={[34, .6, 24]} color="#b6c6a0" shadow={false}/>
    <Box at={[16, -.005, 11]} size={[32, .05, 22]} color="#c8d8b5" shadow={false}/>
    <mesh position={[16,.06,11]} rotation={[-Math.PI/2,0,0]} onClick={event => { if(event.delta>5) return; event.stopPropagation(); onWalk(event.point.x,event.point.z) }}><planeGeometry args={[32,22]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
    <Box at={[16, .015, 4]} size={[26.3, .05, 2.3]} color="#eee3c9" shadow={false}/><Box at={[16, .015, 18]} size={[26.3, .05, 2.3]} color="#eee3c9" shadow={false}/>
    <Box at={[4, .015, 11]} size={[2.3, .05, 14]} color="#eee3c9" shadow={false}/><Box at={[28, .015, 11]} size={[2.3, .05, 14]} color="#eee3c9" shadow={false}/>
    <Box at={[16, .14, 11]} size={[16, .25, 6]} color="#9fb888" shadow={false}/>
    {[[2,2],[30,2],[2,20],[30,20],[10,10],[22,12]].map(([x,z],i) => <Tree key={i} x={x!} z={z!} tone={i % 2 ? '#789a65' : '#91a96c'}/>)}
    <Bench x={10} z={20.2}/><Bench x={22} z={20.2}/><Bench x={1.3} z={11} rotation={Math.PI / 2}/>
    {[7,25].map(x => <group key={x} position={[x, 0, 1.1]}><Box at={[0, .28, 0]} size={[2.4, .5, 1.1]} color="#b69a73"/>{[-.75,0,.75].map(offset => <mesh key={offset} position={[offset,.8,0]}><icosahedronGeometry args={[.45,0]}/><meshStandardMaterial color={x === 7 ? '#c8998e' : '#ddc07e'} flatShading/></mesh>)}</group>)}
    <group position={[4, 0, 1.5]} onClick={event => { event.stopPropagation(); onFeedback() }}><Box at={[0, .7, 0]} size={[.75, 1.4, .6]} color="#a56c50"/><Box at={[0, 1.45, 0]} size={[1.05, .15, .85]} color="#6d7650"/><Box at={[0, 1.05, .31]} size={[.47, .08, .025]} color="#4c453b"/><Box at={[0, .72, .32]} size={[.33, .18, .025]} color="#eadfc5"/></group>
    <group position={[16, 0, 1.8]} onClick={event => { event.stopPropagation(); onBoard() }}>
      <Box at={[0, 1.05, 0]} size={[2.6, .23, 2.6]} color="#a78055"/>{[-.85,.85].flatMap(x => [-.85,.85].map(z => <Box key={`${x}:${z}`} at={[x,.5,z]} size={[.18,1,.18]} color="#827354"/>))}
      <Box at={[0, 1.18, 0]} size={[2.1, .05, 2.1]} color="#e4c891"/>
      {Array.from({ length: 15 }, (_, i) => <group key={i}><Box at={[-.91 + i * .13, 1.21, 0]} size={[.009, .005, 1.85]} color="#8d794d" shadow={false}/><Box at={[0, 1.21, -.91 + i * .13]} size={[1.85, .005, .009]} color="#8d794d" shadow={false}/></group>)}
      {board.flatMap((row, y) => row.map((stone, x) => stone ? <mesh key={`${x}:${y}`} position={[-.91+x*.13,1.24,-.91+y*.13]} scale={[1,.45,1]} castShadow><sphereGeometry args={[.06,8,6]}/><meshStandardMaterial color={stone === 1 ? '#242b25' : '#faf6e8'} roughness={.45}/></mesh> : null))}
    </group>
  </group>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Keep controls available without collecting renderer details. */ }
  render() { return this.state.failed ? <p className="scene-fallback" role="status">3D 장면을 열지 못했습니다. 위의 2D 지도 버튼으로 계속 검수할 수 있습니다.</p> : this.props.children }
}
