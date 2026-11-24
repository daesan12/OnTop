import { Component, lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, createPortal, events, useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Object3D, Scene, SphereGeometry, Vector3, type InstancedMesh, type Material } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { lookKey, lookSources, resolveLook } from '../../world/art/characterLook'
import { createSafeCharacterRig } from '../../world/art/safeCharacterRig'
import { visibleStoneFloor, STONE_FLOOR_HEIGHTS, STONE_DROP_HEIGHT } from './layout'
import { useStoneAppearance } from './useStoneAppearance'
import { StoneRumbleTiles } from './StoneRumbleTiles'
import { StonePigeons } from './StonePigeons'
import { EnvironmentScene } from '../../world/EnvironmentScene'
import { ParkSun } from '../../world/ParkSun'
import { loadStoneRumblePark } from './loadPark'
import { StoneRumblePreparation, type StoneSceneStatus } from './StoneRumblePreparation'
import type { StoneControl, StonePlayer, StoneState } from './protocol'
import { STONE_PLAYER_COLORS as COLORS } from './palette'
import { readStoneCharacterAppearances } from './characterAppearance'
import { StoneRumbleLighting } from './StoneRumbleLighting'
import { StoneHitEffect } from './StoneHitEffect'
import type { StoneFeedbackFrame } from './feedback'
import { followStoneYaw, StonePositionBuffer } from './motion'
import { advanceStoneCamera, STONE_CAMERA_DISTANCE, type StoneCameraState } from './camera'
import { useStoneCameraInput } from './useStoneCameraInput'

const StoneRumbleEnvironment = lazy(loadStoneRumblePark)
// 게임 입력은 캔버스의 DOM 포인터로 받는다. 배경 공원의 시설 선택은 실행하지 않는다.
const gameEvents: typeof events = state => ({ ...events(state), enabled: false })
class SceneBoundary extends Component<{ children: ReactNode; onStatus?: StoneSceneStatus }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onStatus?.(false, error.message || '3D 경기장을 열지 못했어요. 다시 준비해 주세요.') }
  render() { return this.state.failed ? null : this.props.children }
}
export type StoneCamera = MutableRefObject<StoneCameraState>
export type StoneInput = MutableRefObject<Omit<StoneControl, 'kind' | 'seq'>>

type AvatarProps = { player: StonePlayer; index: number; own: boolean; time: number; gameId: string; feedback?: MutableRefObject<StoneFeedbackFrame>; aim?: StoneInput }
function Avatar(props: AvatarProps & { localOnly: boolean }) {
  const appearance = useStoneAppearance(props.player.userId, props.index, props.localOnly)
  return appearance.ready ? <AvatarRig {...props} {...appearance} /> : null
}

function AvatarRig({ player, index, own, time: serverTime, gameId, feedback, aim, source, files, look, whole, metadata }: AvatarProps & {
  source: GLTF; files: ReadonlyMap<string, GLTF>; look: ReturnType<typeof resolveLook>; whole?: GLTF; metadata: ReturnType<typeof useStoneAppearance>['metadata']
}) {
  const shownKey = lookKey(look)
  const sources = useMemo(() => [...new Set([source, ...(whole ? [whole] :
    lookSources(look).flatMap(name => files.get(name) ?? []))])], [source, whole, files, shownKey])
  const appearances = useMemo(() => readStoneCharacterAppearances(sources), [sources])
  const rig = useMemo(() => {
    const rig = createSafeCharacterRig(source, look, files, whole)
    const apply = (material: Material) => {
      for (const appearance of appearances) {
        const replacement = appearance.get(material)
        if (replacement) return replacement
      }
      return material
    }
    rig.root.traverse(object => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(apply) : apply(object.material)
      }
    })
    return rig
  }, [source, shownKey, files, whole, appearances])
  const hipHeight = rig.hipHeight * .95
  const group = useRef<Group>(null), initial = useRef(true)
  const gait = useRef({ phase: 0, strength: 0, airborne: 0 })
  const body = useRef<Group>(null), dive = useRef(0), diveYaw = useRef(0)
  const aimMarker = useRef<Group>(null), reticle = useRef<MeshBasicMaterial>(null)
  const facing = useRef({ x: player.x, z: player.z, yaw: Math.atan2(player.aimX, player.aimZ) })
  const positions = useMemo(() => new StonePositionBuffer(), [])
  useEffect(() => { initial.current = true; dive.current = 0; positions.reset() }, [gameId, positions])
  useEffect(() => () => rig.dispose(), [rig])
  useFrame((_, dt) => {
    const root = group.current
    if (!root || !player.alive || dt <= 0) return
    if (initial.current) {
      root.position.set(player.x, player.y, player.z)
      facing.current = { x: player.x, z: player.z, yaw: Math.atan2(player.aimX, player.aimZ) }
      root.rotation.y = facing.current.yaw
      gait.current = { phase: 0, strength: 0, airborne: Number(!player.grounded) }
      initial.current = false
    }
    if (reticle.current) reticle.current.color.set(performance.now() - (feedback?.current.confirmedAt ?? -Infinity) < 240 ? '#f2ba35' : '#fff5d0')
    const previousX = root.position.x, previousZ = root.position.z
    positions.sample(player, serverTime, performance.now(), root.position)
    const time = positions.displayTime
    // 보간 잔여 이동이나 마우스 조준 대신 서버 좌표의 실제 이동 방향을 따른다.
    const dx = player.x - facing.current.x, dz = player.z - facing.current.z
    if (Math.hypot(dx, dz) > .001) facing.current.yaw = Math.atan2(dx, dz)
    facing.current.x = player.x; facing.current.z = player.z
    const sliding = player.alive && time >= player.slideStartedAt && time < player.slideUntil
    if (sliding) diveYaw.current = Math.atan2(player.slideX, player.slideZ)
    dive.current += (Number(sliding) - dive.current) * (1 - Math.exp(-dt * 36))
    const blend = dive.current, standing = 1 - blend
    root.rotation.y = followStoneYaw(root.rotation.y, sliding || blend > .05 ? diveYaw.current : facing.current.yaw,
      Math.min(dt, .05), 20, 14)
    if (aimMarker.current) {
      const direction = aim?.current ?? player
      aimMarker.current.rotation.y = Math.atan2(direction.aimX, direction.aimZ) - root.rotation.y
    }
    root.rotation.z = time >= player.hitAt && time - player.hitAt < 400 && player.hitAt > 0 ? -.28 : 0
    const travelled = Math.hypot(root.position.x - previousX, root.position.z - previousZ)
    const motion = gait.current
    const gaitBlend = 1 - Math.exp(-dt * 22)
    const walking = player.grounded && !sliding && !(player.hitAt > 0 && time >= player.hitAt && time - player.hitAt < 400)
    if (walking) motion.phase = (motion.phase + travelled * 4.8) % (2 * Math.PI)
    const strideStrength = walking ? Math.min(1, travelled / (dt * 3.8)) : 0
    motion.strength += (strideStrength - motion.strength) * gaitBlend
    motion.airborne += (Number(!player.grounded) - motion.airborne) * gaitBlend
    const stride = Math.sin(motion.phase), swing = stride * .72 * motion.strength
    const { airborne } = motion
    if (body.current) {
      // 골반을 축으로 몸을 앞으로 던진다. 모델 비율과 서버 판정 높이는 유지한다.
      const progress = sliding ? Math.min(1, (time - player.slideStartedAt) / Math.max(1, player.slideUntil - player.slideStartedAt)) : 0
      body.current.rotation.x = blend * 1.35 + standing * motion.strength * .11
      body.current.position.y = hipHeight - .43 * blend + Math.sin(progress * Math.PI) * .1 * blend
    }
    rig.reset()
    rig.set('upperLeg_L', (swing - .5 * airborne) * standing - .12 * blend)
    rig.set('upperLeg_R', (-swing + .35 * airborne) * standing + .08 * blend)
    rig.set('lowerLeg_L', (Math.max(0, -stride) * .62 * motion.strength + .34 * airborne) * standing + .45 * blend)
    rig.set('lowerLeg_R', (Math.max(0, stride) * .62 * motion.strength + .48 * airborne) * standing + .25 * blend)
    rig.set('upperArm_L', (-swing * .7 - 1.35 * airborne) * standing - 2.6 * blend, 0, -.18)
    rig.set('upperArm_R', (swing * .7 - 1.35 * airborne) * standing - 2.6 * blend, 0, .18)
    rig.set('lowerArm_L', -.15 * blend)
    rig.set('lowerArm_R', -.15 * blend)
    rig.set('spine', -.08 * blend)
    rig.set('neck', -.12 * blend)
    rig.set('head', -.3 * blend)
    rig.apply(dt)
  })
  return <group name={`stone-player-${player.userId}`} ref={group} visible={player.alive} userData={{ ...metadata, stoneAppearanceReady: true }}>
    <StoneHitEffect userId={player.userId} feedback={feedback} />
    <group ref={body} position={[0, hipHeight, 0]}><primitive object={rig.root} position={[0, -hipHeight, 0]} scale={.95} /></group>
    <mesh position={[0, .025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[own ? .42 : .34, own ? .53 : .42, 32]} /><meshBasicMaterial fog={false} toneMapped={false} color={COLORS[index]} transparent opacity={.9} />
    </mesh>
    {own && <mesh position={[0, 2.05, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.13, .25, 4]} /><meshBasicMaterial fog={false} toneMapped={false} color="#fff3ae" /></mesh>}
    <group name="stone-aim" ref={aimMarker}><mesh position={[0, .035, .7]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.13, .3, 3]} /><meshBasicMaterial fog={false} toneMapped={false} color={COLORS[index]} /></mesh>{aim && <mesh name="stone-pigeon-reticle" position={[0, .8, 8]} rotation={[0, Math.PI, 0]}><ringGeometry args={[.11, .14, 24]} /><meshBasicMaterial fog={false} toneMapped={false} ref={reticle} color="#fff5d0" depthWrite={false} /></mesh>}</group>
  </group>
}

function ArrivalClouds({ state }: { state: StoneState }) {
  const clouds = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new SphereGeometry(1, 8, 6), [])
  const material = useMemo(() => new MeshBasicMaterial({ color: '#f7fbfa', fog: false, toneMapped: false, transparent: true, opacity: .85, depthWrite: false }), [])
  const transform = useMemo(() => new Object3D(), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useEffect(() => {
    if (!clouds.current || state.phase !== 'DROPPING') return
    state.players.forEach((player, index) => {
      for (let puff = 0; puff < 4; puff++) {
        transform.position.set(player.x + (puff - 1.5) * .9, STONE_DROP_HEIGHT + 2.4 + (puff % 2) * .35, player.z - .6)
        transform.scale.set(1.1, .6 + (puff % 2) * .2, .8)
        transform.updateMatrix(); clouds.current!.setMatrixAt(index * 4 + puff, transform.matrix)
      }
    })
    clouds.current.instanceMatrix.needsUpdate = true
  }, [state.phase, state.players, transform])
  return <group visible={state.phase === 'DROPPING'} userData={{ prepareWhenHidden: true }}>
    <instancedMesh ref={clouds} args={[geometry, material, state.players.length * 4]} frustumCulled={false} dispose={null} />
  </group>
}

function Stage({ state, ownId, viewId, input, fire, feedback, localOnly, controls, cameraEnabled, onCapture }: {
  state: StoneState; ownId: string; viewId: string; input: StoneInput; fire: () => void; localOnly: boolean
  controls: StoneCamera; cameraEnabled: boolean; onCapture: (captured: boolean) => void
  feedback?: MutableRefObject<StoneFeedbackFrame>
}) {
  const material = useMemo(() => new MeshBasicMaterial({ fog: false, toneMapped: false, transparent: true, opacity: .34, depthWrite: false }), [])
  useEffect(() => () => material.dispose(), [material])
  const { camera, size } = useThree()
  const player = state.players.find(p => p.userId === viewId)
  const lastFloor = useRef(STONE_FLOOR_HEIGHTS.length - 1)
  if (player?.alive) lastFloor.current = visibleStoneFloor(player.floor, player.y)
  const ownFloor = lastFloor.current
  const cameraReady = useRef(false)
  const clickPending = useRef(false)
  const previousView = useRef(viewId), previousGame = useRef(state.gameId)
  const focus = useMemo(() => new Vector3(), []), desiredFocus = useMemo(() => new Vector3(), [])
  const followedPosition = useMemo(() => new StonePositionBuffer(), [])
  useStoneCameraInput(controls, cameraEnabled, clickPending, onCapture)
  useFrame((_, dt) => {
    const aspect = size.width / size.height
    const control = controls.current
    const newGame = previousGame.current !== state.gameId
    if (newGame || previousView.current !== viewId) followedPosition.reset()
    // 탈락/대상 부재 중에는 마지막 초점을 유지하고 새 생존 대상을 받은 뒤 이동한다.
    if (player?.alive || !cameraReady.current) {
      const x = player?.alive ? player.x : 0, y = player?.alive ? player.y : STONE_FLOOR_HEIGHTS.at(-1)!, z = player?.alive ? player.z : 0
      if (player?.alive) followedPosition.sample(player, state.serverTime, performance.now(), desiredFocus)
      else desiredFocus.set(x, y, z)
    }
    if (!cameraReady.current || newGame) {
      focus.copy(desiredFocus)
      cameraReady.current = true
    }
    previousView.current = viewId; previousGame.current = state.gameId
    // Smooth the follow point, but apply the orbit as an angle so a quick half-turn
    // doesn't interpolate the camera through the player.
    focus.lerp(desiredFocus, 1 - Math.exp(-dt * 14))
    const cameraDelta = Math.min(dt, .05)
    advanceStoneCamera(control, cameraDelta)
    const sin = Math.sin(control.renderedYaw), cos = Math.cos(control.renderedYaw)
    const scale = control.zoom * Math.max(1, Math.min(1.2, .9 / aspect))
    const distance = STONE_CAMERA_DISTANCE * scale
    const horizontal = Math.cos(control.renderedPitch) * distance
    camera.position.set(focus.x + sin * horizontal, focus.y + 1 + Math.sin(control.renderedPitch) * distance,
      focus.z + cos * horizontal)
    camera.lookAt(focus.x - sin, focus.y + .9, focus.z - cos)
    camera.updateMatrixWorld()
    if (player?.userId === ownId && player.alive && cameraEnabled) {
      input.current.aimX = -sin; input.current.aimZ = -cos
    }
    if (clickPending.current) {
      clickPending.current = false
      if (cameraEnabled) fire()
    }
  })
  return <>
    <StoneRumbleTiles tiles={state.tiles} material={material} time={state.serverTime} ownFloor={ownFloor} />
    <ArrivalClouds state={state} />
    {state.players.map((player, index) => <Suspense key={`${state.gameId}/${player.userId}`} fallback={null}><Avatar localOnly={localOnly} player={player} index={index} own={player.userId === viewId} time={state.serverTime} gameId={state.gameId} feedback={feedback} aim={player.userId === ownId ? input : undefined} /></Suspense>)}
    <StonePigeons state={state} />
  </>
}

type StoneRumbleSceneProps = Omit<Parameters<typeof Stage>[0], 'onCapture'> & {
  onStatus: StoneSceneStatus; preparationAttempt: number; paused: boolean; sceneReady: boolean
}

export const StoneRumbleScene = memo(function StoneRumbleScene({ onStatus, preparationAttempt, paused, sceneReady, ...props }: StoneRumbleSceneProps) {
  const playScene = useMemo(() => { const scene = new Scene(); scene.name = 'stone-rumble-play'; return scene }, [])
  const [captured, setCaptured] = useState(false)
  return <div className="stone-rumble-scene" data-view-id={props.viewId} data-camera="third-person" data-pointer-lock={captured} aria-label="육각 발판 돌탑 경기장">
    <SceneBoundary key={preparationAttempt} onStatus={onStatus}>
      <Canvas dpr={1} frameloop={paused ? 'demand' : 'always'} events={gameEvents} camera={{ position: [0, 42, 7.5], fov: 55, near: .1, far: 800 }} gl={{ alpha: false, antialias: true }}>
        {!sceneReady && <SceneBoundary onStatus={onStatus}><Suspense fallback={null}>
          <group name="stone-rumble-backdrop-source">
            <EnvironmentScene />
            <ParkSun quality="low" />
            <StoneRumbleEnvironment />
          </group>
        </Suspense></SceneBoundary>}
        <Suspense fallback={null}>
          {createPortal(<><StoneRumbleLighting /><Stage {...props} onCapture={setCaptured} /></>, playScene)}
          <StoneRumblePreparation onStatus={onStatus} playScene={playScene} playerIds={props.state.players.map(p => p.userId)} />
        </Suspense>
      </Canvas>
      {props.cameraEnabled && <div className="stone-rumble-camera-hint" aria-live="polite">
        <span className="stone-camera-mouse">{captured ? '마우스로 둘러보기 · Esc 시점 해제' : '화면 클릭 → 마우스로 둘러보기 · 우클릭 드래그도 가능'}</span>
        <span className="stone-camera-touch">드래그로 좌우·상하 둘러보기</span>
      </div>}
    </SceneBoundary>
  </div>
}, (previous, next) => {
  // 준비가 끝난 로딩 대기 중에는 서버 시각/준비 인원 갱신이 숨겨진 Canvas를 다시 그리지 않게 한다.
  // 낙하 시작, 재시도, WebGL 복구로 paused가 풀리면 최신 상태로 즉시 렌더링한다.
  return previous.paused && next.paused && previous.state.gameId === next.state.gameId
    && previous.sceneReady === next.sceneReady
    && previous.preparationAttempt === next.preparationAttempt && previous.onStatus === next.onStatus
    && previous.ownId === next.ownId && previous.viewId === next.viewId
    && previous.input === next.input && previous.fire === next.fire
    && previous.feedback === next.feedback && previous.localOnly === next.localOnly
    && previous.controls === next.controls && previous.cameraEnabled === next.cameraEnabled
})
