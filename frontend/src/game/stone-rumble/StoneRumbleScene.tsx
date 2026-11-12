import { Component, lazy, memo, Suspense, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, createPortal, events, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Object3D, Plane, Scene, SphereGeometry, Vector2, Vector3, type InstancedMesh } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { createCharacterRig, characterUrls } from '../../world/art/CharacterRig'
import { pigeonGeometry, pigeonMaterial } from '../../world/pigeons/pigeonGeometry'
import { visibleStoneFloor } from './layout'
import { StoneRumbleTiles } from './StoneRumbleTiles'
import { EnvironmentScene } from '../../world/EnvironmentScene'
import { ParkSun } from '../../world/ParkSun'
import { loadStoneRumblePark } from './loadPark'
import { StoneRumblePreparation, type StoneSceneStatus } from './StoneRumblePreparation'
import type { StoneControl, StonePigeon, StonePlayer, StoneState } from './protocol'
import { STONE_PLAYER_COLORS as COLORS } from './palette'
import { readStoneCharacterAppearance } from './characterAppearance'
import { StoneRumbleLighting } from './StoneRumbleLighting'
import { createStoneMaterial } from './visibility'
import { StoneHitEffect } from './StoneHitEffect'
import type { StoneFeedbackFrame } from './feedback'

const StoneRumbleEnvironment = lazy(loadStoneRumblePark)
const stonePigeonMaterial = createStoneMaterial(pigeonMaterial)
// 게임 입력은 캔버스의 DOM 포인터로 받는다. 배경 공원의 시설 선택은 실행하지 않는다.
const gameEvents: typeof events = state => ({ ...events(state), enabled: false })
class SceneBoundary extends Component<{ children: ReactNode; onStatus: StoneSceneStatus }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onStatus(false, '공원 파일을 불러오지 못했어요. 새로고침해 주세요.') }
  render() { return this.state.failed ? null : this.props.children }
}
export type StoneInput = MutableRefObject<Omit<StoneControl, 'kind' | 'seq'>>

function Avatar({ player, index, own, time, gameId, feedback }: { player: StonePlayer; index: number; own: boolean; time: number; gameId: string; feedback?: MutableRefObject<StoneFeedbackFrame> }) {
  const source = useLoader(ParkAssetLoader, characterUrls[index % 2]!)
  const appearance = readStoneCharacterAppearance(source)
  const rig = useMemo(() => {
    const rig = createCharacterRig(source)
    rig.root.traverse(object => {
      if (object instanceof Mesh) {        object.material = Array.isArray(object.material)
        ? object.material.map(material => appearance.get(material) ?? material)
        : appearance.get(object.material) ?? object.material
      }
    })
    return rig
  }, [source, appearance])
  const hipHeight = rig.hipHeight * .95
  const group = useRef<Group>(null), initial = useRef(true), moving = useRef(0)
  const body = useRef<Group>(null), dive = useRef(0), diveYaw = useRef(0)
  const aimMarker = useRef<Group>(null)
  const facing = useRef({ x: player.x, z: player.z, yaw: Math.atan2(player.aimX, player.aimZ) })
  const target = useMemo(() => new Vector3(), [])
  useEffect(() => { initial.current = true; moving.current = 0; dive.current = 0 }, [gameId])
  useEffect(() => () => rig.dispose(), [rig])
  useFrame((_, dt) => {
    const root = group.current
    if (!root) return
    const previousX = root.position.x, previousZ = root.position.z
    if (initial.current) {
      root.position.set(player.x, player.y, player.z)
      facing.current = { x: player.x, z: player.z, yaw: Math.atan2(player.aimX, player.aimZ) }
      initial.current = false
    }
    root.position.lerp(target.set(player.x, player.y, player.z), 1 - Math.exp(-dt * 24))
    // 보간 잔여 이동이나 마우스 조준 대신 서버 좌표의 실제 이동 방향을 따른다.
    const dx = player.x - facing.current.x, dz = player.z - facing.current.z
    if (Math.hypot(dx, dz) > .001) facing.current.yaw = Math.atan2(dx, dz)
    facing.current.x = player.x; facing.current.z = player.z
    const sliding = player.alive && time >= player.slideStartedAt && time < player.slideUntil
    if (sliding) diveYaw.current = Math.atan2(player.slideX, player.slideZ)
    dive.current += (Number(sliding) - dive.current) * (1 - Math.exp(-dt * 36))
    const blend = dive.current, standing = 1 - blend
    root.rotation.y = sliding || blend > .05 ? diveYaw.current : facing.current.yaw
    if (aimMarker.current) aimMarker.current.rotation.y = Math.atan2(player.aimX, player.aimZ) - root.rotation.y
    root.rotation.z = time - player.hitAt < 400 && player.hitAt > 0 ? -.28 : 0
    moving.current += Math.hypot(root.position.x - previousX, root.position.z - previousZ) * 6
    const walking = Math.hypot(player.x - previousX, player.z - previousZ) > .02
    const swing = walking ? Math.sin(moving.current) * .65 : 0
    if (body.current) {
      // 골반을 축으로 몸을 앞으로 던진다. 모델 비율과 서버 판정 높이는 유지한다.
      const progress = sliding ? Math.min(1, (time - player.slideStartedAt) / Math.max(1, player.slideUntil - player.slideStartedAt)) : 0
      body.current.rotation.x = blend * 1.35
      body.current.position.y = hipHeight - .43 * blend + Math.sin(progress * Math.PI) * .1 * blend
    }
    rig.reset()
    rig.set('upperLeg_L', (player.grounded ? swing : -.5) * standing - .12 * blend)
    rig.set('upperLeg_R', (player.grounded ? -swing : .35) * standing + .08 * blend)
    rig.set('lowerLeg_L', .45 * blend)
    rig.set('lowerLeg_R', .25 * blend)
    rig.set('upperArm_L', (player.grounded ? -swing * .6 : -1.5) * standing - 2.6 * blend, 0, -.18)
    rig.set('upperArm_R', (player.grounded ? swing * .6 : -1.5) * standing - 2.6 * blend, 0, .18)
    rig.set('lowerArm_L', -.15 * blend)
    rig.set('lowerArm_R', -.15 * blend)
    rig.set('spine', -.08 * blend)
    rig.set('neck', -.12 * blend)
    rig.set('head', -.3 * blend)
    rig.apply(dt)
  })
  return <group name={`stone-player-${player.userId}`} ref={group} visible={player.alive}>
    <StoneHitEffect userId={player.userId} feedback={feedback} />
    <group ref={body} position={[0, hipHeight, 0]}><primitive object={rig.root} position={[0, -hipHeight, 0]} scale={.95} /></group>
    <mesh position={[0, .025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[own ? .42 : .34, own ? .53 : .42, 32]} /><meshBasicMaterial fog={false} toneMapped={false} color={COLORS[index]} transparent opacity={.9} />
    </mesh>
    {own && <mesh position={[0, 2.05, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.13, .25, 4]} /><meshBasicMaterial fog={false} toneMapped={false} color="#fff3ae" /></mesh>}
    <group name="stone-aim" ref={aimMarker}><mesh position={[0, .035, .7]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.13, .3, 3]} /><meshBasicMaterial fog={false} toneMapped={false} color={COLORS[index]} /></mesh></group>
  </group>
}

function Pigeon({ pigeon, time }: { pigeon: StonePigeon; time: number }) {
  const left = useRef<Group>(null), right = useRef<Group>(null)
  useFrame(() => {
    const angle = .2 + Math.sin(time * .038) * .85
    if (left.current) left.current.rotation.z = -angle
    if (right.current) right.current.rotation.z = angle
  })
  return <group position={[pigeon.x, pigeon.y, pigeon.z]} rotation={[0, Math.atan2(pigeon.vx, pigeon.vz), 0]} scale={3.3}>
    <mesh geometry={pigeonGeometry.body} material={stonePigeonMaterial} />
    <mesh geometry={pigeonGeometry.head} material={stonePigeonMaterial} position={[0, .187, .064]} />
    <group ref={left} position={[-.062, .18, .005]}><mesh geometry={pigeonGeometry.leftWing} material={stonePigeonMaterial} /></group>
    <group ref={right} position={[.062, .18, .005]}><mesh geometry={pigeonGeometry.rightWing} material={stonePigeonMaterial} /></group>
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
        transform.position.set(player.x + (puff - 1.5) * .9, 35.4 + (puff % 2) * .35, player.z - .6)
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

function Stage({ state, ownId, viewId, input, fire, feedback }: {
  state: StoneState; ownId: string; viewId: string; input: StoneInput; fire: () => void
  feedback?: MutableRefObject<StoneFeedbackFrame>
}) {
  const material = useMemo(() => new MeshBasicMaterial({ fog: false, toneMapped: false, transparent: true, opacity: .34, depthWrite: false }), [])
  useEffect(() => () => material.dispose(), [material])
  const { camera, raycaster, gl, size } = useThree()
  const pointer = useMemo(() => new Vector2(), [])
  const player = state.players.find(p => p.userId === viewId)
  const lastFloor = useRef(2)
  if (player?.alive) lastFloor.current = visibleStoneFloor(player.floor, player.y)
  const ownFloor = lastFloor.current
  const point = useMemo(() => new Vector3(), []), plane = useMemo(() => new Plane(new Vector3(0, 1, 0)), [])
  const aimed = useRef(false), cameraReady = useRef(false)
  const previousView = useRef(viewId), previousGame = useRef(state.gameId)
  const eye = useMemo(() => new Vector3(), []), focus = useMemo(() => new Vector3(), [])
  const desiredEye = useMemo(() => new Vector3(), []), desiredFocus = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
        1 - (event.clientY - bounds.top) / bounds.height * 2)
      aimed.current = true
    }
    gl.domElement.addEventListener('pointermove', move)
    gl.domElement.addEventListener('pointerdown', fire)
    return () => { gl.domElement.removeEventListener('pointermove', move); gl.domElement.removeEventListener('pointerdown', fire) }
  }, [gl, fire, pointer])
  useFrame((_, dt) => {
    const aspect = size.width / size.height
    if (player?.alive || !cameraReady.current) {
      // 세로 화면에서도 세 층을 담으려고 멀어지지 않고 주변 발판에 집중한다.
      const scale = Math.max(1, Math.min(1.2, .9 / aspect))
      const x = player?.alive ? player.x : 0, y = player?.alive ? player.y : 24, z = player?.alive ? player.z : 0
      desiredEye.set(x, y + 9 * scale, z + 7.5 * scale)
      desiredFocus.set(x, y + .4, z - 1.5)
    }
    if (!cameraReady.current || previousView.current !== viewId || previousGame.current !== state.gameId) {
      eye.copy(desiredEye); focus.copy(desiredFocus)
      cameraReady.current = true; previousView.current = viewId; previousGame.current = state.gameId
    }
    const alpha = 1 - Math.exp(-dt * 7)
    eye.lerp(desiredEye, alpha); focus.lerp(desiredFocus, alpha)
    camera.position.copy(eye); camera.lookAt(focus)
    if (player?.userId === ownId && player.alive && aimed.current) {
      plane.constant = -(player.y + .8)
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(plane, point)) {
        const length = Math.hypot(point.x - player.x, point.z - player.z)
        if (length > .1) { input.current.aimX = (point.x - player.x) / length; input.current.aimZ = (point.z - player.z) / length }
      }
    }
  })
  return <>
    <StoneRumbleTiles tiles={state.tiles} material={material} time={state.serverTime} ownFloor={ownFloor} />
    <ArrivalClouds state={state} />
    {state.players.map((player, index) => <Avatar key={player.userId} player={player} index={index} own={player.userId === viewId} time={state.serverTime} gameId={state.gameId} feedback={feedback} />)}
    {state.pigeons.map(pigeon => <Pigeon key={pigeon.id} pigeon={pigeon} time={state.serverTime} />)}
    <group visible={false} userData={{ prepareWhenHidden: true }}>
      <Pigeon pigeon={{ id: -1, owner: ownId, x: 0, y: 24.8, z: 0, vx: 20, vz: 0 }} time={0} />
    </group>
  </>
}

type StoneRumbleSceneProps = Parameters<typeof Stage>[0] & {
  onStatus: StoneSceneStatus; preparationAttempt: number; paused: boolean
}

export const StoneRumbleScene = memo(function StoneRumbleScene({ onStatus, preparationAttempt, paused, ...props }: StoneRumbleSceneProps) {
  const playScene = useMemo(() => { const scene = new Scene(); scene.name = 'stone-rumble-play'; return scene }, [])
  return <div className="stone-rumble-scene" data-view-id={props.viewId} data-camera="current-floor" aria-label="현재 층 중심 돌탑 경기장">
    <Canvas dpr={1} frameloop={paused ? 'demand' : 'always'} events={gameEvents} camera={{ position: [0, 42, 7.5], fov: 50, near: .1, far: 800 }} gl={{ alpha: false, antialias: true }}>
      <EnvironmentScene />
      <ParkSun quality="low" />
      <SceneBoundary key={preparationAttempt} onStatus={onStatus}><Suspense fallback={null}>
        <StoneRumbleEnvironment />
        {createPortal(<><StoneRumbleLighting /><Stage {...props} /></>, playScene)}
        <StoneRumblePreparation key={preparationAttempt} onStatus={onStatus} playScene={playScene} />
      </Suspense></SceneBoundary>
    </Canvas>
  </div>
}, (previous, next) => {
  // 준비가 끝난 로딩 대기 중에는 서버 시각/준비 인원 갱신이 숨겨진 Canvas를 다시 그리지 않게 한다.
  // 낙하 시작, 재시도, WebGL 복구로 paused가 풀리면 최신 상태로 즉시 렌더링한다.
  return previous.paused && next.paused && previous.state.gameId === next.state.gameId
    && previous.preparationAttempt === next.preparationAttempt && previous.onStatus === next.onStatus
    && previous.ownId === next.ownId && previous.viewId === next.viewId
    && previous.input === next.input && previous.fire === next.fire
    && previous.feedback === next.feedback
})
