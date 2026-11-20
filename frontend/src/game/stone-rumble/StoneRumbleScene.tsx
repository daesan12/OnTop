import { Component, lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, createPortal, events, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Object3D, Plane, Scene, SphereGeometry, Vector2, Vector3, type InstancedMesh, type Material } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls } from '../../world/art/CharacterRig'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { useSession } from '../../network/worldClient'
import { emptyEquipment } from '../../network/equipment'
import { WARDROBE_OUTFITS_ENABLED } from '../../features/wardrobe/feature'
import { availableLook, isCharacterSource, lookKey, lookSources, resolveLook } from '../../world/art/characterLook'
import { loadedOutfit } from '../../world/art/outfitSources'
import { createSafeCharacterRig } from '../../world/art/safeCharacterRig'
import { resolveWholeSkin } from '../../world/art/wholeSkin'
import { pigeonGeometry, pigeonMaterial } from '../../world/pigeons/pigeonGeometry'
import { visibleStoneFloor } from './layout'
import { StoneRumbleTiles } from './StoneRumbleTiles'
import { EnvironmentScene } from '../../world/EnvironmentScene'
import { ParkSun } from '../../world/ParkSun'
import { loadStoneRumblePark } from './loadPark'
import { StoneRumblePreparation, type StoneSceneStatus } from './StoneRumblePreparation'
import type { StoneControl, StonePigeon, StonePlayer, StoneState } from './protocol'
import { STONE_PLAYER_COLORS as COLORS } from './palette'
import { readStoneCharacterAppearances } from './characterAppearance'
import { StoneRumbleLighting } from './StoneRumbleLighting'
import { createStoneMaterial } from './visibility'
import { StoneHitEffect } from './StoneHitEffect'
import type { StoneFeedbackFrame } from './feedback'
import { followStoneYaw } from './motion'

const StoneRumbleEnvironment = lazy(loadStoneRumblePark)
const stonePigeonMaterial = createStoneMaterial(pigeonMaterial)
// 게임 입력은 캔버스의 DOM 포인터로 받는다. 배경 공원의 시설 선택은 실행하지 않는다.
const gameEvents: typeof events = state => ({ ...events(state), enabled: false })
class SceneBoundary extends Component<{ children: ReactNode; onStatus?: StoneSceneStatus }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onStatus?.(false, '3D 경기장을 열지 못했어요. 다시 준비해 주세요.') }
  render() { return this.state.failed ? null : this.props.children }
}
export type StoneCamera = MutableRefObject<{ yaw: number; renderedYaw: number; manualOrbit: boolean; pointerAiming: boolean }>
export type StoneInput = MutableRefObject<Omit<StoneControl, 'kind' | 'seq'>>

type AvatarProps = { player: StonePlayer; index: number; own: boolean; time: number; gameId: string; feedback?: MutableRefObject<StoneFeedbackFrame> }
function Avatar(props: AvatarProps & { localOnly: boolean }) {
  const { player, index, localOnly } = props
  const base = useLoader(ParkAssetLoader, characterUrls)
  const [appearance] = useState(() => {
    // 공원에서 이미 로드한 외형을 써서 경기 도중 리그와 재질을 다시 만들지 않는다.
    const { profiles, equipment } = useSession.getState()
    const variant = (localOnly ? index % 2 === 1 : profiles[player.userId]?.character === 'girl') ? 'girl' : 'man'
    const worn = !localOnly && WARDROBE_OUTFITS_ENABLED ? equipment[player.userId] ?? emptyEquipment : emptyEquipment
    const look = resolveLook(variant, worn)
    const whole = resolveWholeSkin(variant, worn)
    const files = new Map<string, GLTF>([['man', base[0]!], ['girl', base[1]!]])
    for (const name of whole ? [whole.source] : lookSources(look).filter(source => !isCharacterSource(source))) {
      const asset = loadedOutfit(name)
      if (asset) files.set(name, asset)
    }
    return { source: files.get(variant)!, files, look: availableLook(variant, look, source => files.has(source)),
      whole: whole && files.get(whole.source) }
  })
  return <AvatarRig {...props} {...appearance} />
}

function AvatarRig({ player, index, own, time, gameId, feedback, source, files, look, whole }: AvatarProps & {
  source: GLTF; files: ReadonlyMap<string, GLTF>; look: ReturnType<typeof resolveLook>; whole?: GLTF
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
  const aimMarker = useRef<Group>(null)
  const facing = useRef({ x: player.x, z: player.z, yaw: Math.atan2(player.aimX, player.aimZ) })
  useEffect(() => { initial.current = true; dive.current = 0 }, [gameId])
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
    const previousX = root.position.x, previousZ = root.position.z
    const follow = 1 - Math.exp(-dt * 34)
    root.position.x += (player.x - root.position.x) * follow
    root.position.z += (player.z - root.position.z) * follow
    root.position.y += (player.y - root.position.y) * (1 - Math.exp(-dt * 38))
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
    if (aimMarker.current) aimMarker.current.rotation.y = Math.atan2(player.aimX, player.aimZ) - root.rotation.y
    root.rotation.z = time - player.hitAt < 400 && player.hitAt > 0 ? -.28 : 0
    const travelled = Math.hypot(root.position.x - previousX, root.position.z - previousZ)
    const motion = gait.current
    const gaitBlend = 1 - Math.exp(-dt * 22)
    const walking = player.grounded && !sliding && !(player.hitAt > 0 && time - player.hitAt < 400)
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

function Stage({ state, ownId, viewId, input, fire, feedback, localOnly, controls, cameraEnabled }: {
  state: StoneState; ownId: string; viewId: string; input: StoneInput; fire: () => void; localOnly: boolean
  controls: StoneCamera; cameraEnabled: boolean
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
  const cameraReady = useRef(false), zoom = useRef(1)
  const cameraEnabledRef = useRef(cameraEnabled)
  cameraEnabledRef.current = cameraEnabled
  const clickPending = useRef(false)
  const previousView = useRef(viewId), previousGame = useRef(state.gameId)
  const focus = useMemo(() => new Vector3(), []), desiredFocus = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const canvas = gl.domElement
    const tapSlop = 8
    let gesture: { id: number; x: number; y: number; orbiting: boolean; canTap: boolean } | null = null
    const clearGesture = () => {
      gesture = null
      controls.current.manualOrbit = false
    }
    const blur = () => { clearGesture(); clickPending.current = false }
    const aim = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
        1 - (event.clientY - bounds.top) / bounds.height * 2)
      controls.current.pointerAiming = true
    }
    const move = (event: PointerEvent) => {
      if (!cameraEnabledRef.current) return
      // Pointerdown only fires for the first mouse button in a chord.
      if (event.pointerType === 'mouse' && (event.buttons & 2) !== 0 && !gesture) {
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, orbiting: true, canTap: false }
        canvas.setPointerCapture(event.pointerId)
      }
      if (gesture?.id === event.pointerId) {
        if (event.pointerType === 'mouse' && (event.buttons & 2) === 0) {
          clearGesture()
          aim(event)
          return
        }
        if (!gesture.orbiting && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < tapSlop) return
        gesture.orbiting = true
        controls.current.manualOrbit = true
        controls.current.pointerAiming = false
        controls.current.yaw = (controls.current.yaw - (event.clientX - gesture.x) * .008) % (2 * Math.PI)
        gesture.x = event.clientX
      } else if (event.pointerType === 'mouse') aim(event)
    }
    const down = (event: PointerEvent) => {
      if (!cameraEnabledRef.current) return
      const touch = event.pointerType === 'touch'
      if (touch && !event.isPrimary) {
        if (gesture) gesture.canTap = false
        return
      }
      if (touch || event.button === 2) {
        event.preventDefault()
        if (gesture) return
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, orbiting: !touch, canTap: touch }
        if (!touch) {
          controls.current.manualOrbit = true
          controls.current.pointerAiming = false
        }
        canvas.setPointerCapture(event.pointerId)
      } else if (event.button === 0) {
        aim(event)
        clickPending.current = true
      }
    }
    const cancel = (event: PointerEvent) => { if (gesture?.id === event.pointerId) clearGesture() }
    const up = (event: PointerEvent) => {
      if (gesture?.id !== event.pointerId) return
      if (cameraEnabledRef.current && gesture.canTap && !gesture.orbiting
        && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < tapSlop) {
        aim(event)
        clickPending.current = true
      }
      cancel(event)
    }
    const context = (event: Event) => { if (cameraEnabledRef.current) event.preventDefault() }
    const wheel = (event: WheelEvent) => {
      if (!cameraEnabledRef.current) return
      event.preventDefault()
      zoom.current = Math.min(1.35, Math.max(.74, zoom.current + Math.sign(event.deltaY) * .065))
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    canvas.addEventListener('contextmenu', context)
    canvas.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', blur)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      canvas.removeEventListener('contextmenu', context)
      canvas.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', blur)
      clearGesture()
    }
  }, [gl, pointer, controls])
  useFrame((_, dt) => {
    const aspect = size.width / size.height
    const control = controls.current
    if (player?.alive || !cameraReady.current) {
      const x = player?.alive ? player.x : 0, y = player?.alive ? player.y : 24, z = player?.alive ? player.z : 0
      desiredFocus.set(x, y, z)
    }
    if (!cameraReady.current || previousView.current !== viewId || previousGame.current !== state.gameId) {
      focus.copy(desiredFocus)
      cameraReady.current = true; previousView.current = viewId; previousGame.current = state.gameId
    }
    // Smooth the follow point, but apply the orbit as an angle so a quick half-turn
    // doesn't interpolate the camera through the player.
    focus.lerp(desiredFocus, 1 - Math.exp(-dt * 14))
    const cameraDelta = Math.min(dt, .05)
    control.renderedYaw = followStoneYaw(control.renderedYaw, control.yaw, cameraDelta,
      control.manualOrbit ? 24 : 12, control.manualOrbit ? 24 : 5.2)
    const sin = Math.sin(control.renderedYaw), cos = Math.cos(control.renderedYaw)
    const scale = zoom.current * Math.max(1, Math.min(1.2, .9 / aspect))
    camera.position.set(focus.x + sin * 7.5 * scale, focus.y + 9 * scale, focus.z + cos * 7.5 * scale)
    camera.lookAt(focus.x - sin * 1.5, focus.y + .4, focus.z - cos * 1.5)
    camera.updateMatrixWorld()
    if (player?.userId === ownId && player.alive && cameraEnabled && controls.current.pointerAiming) {
      plane.constant = -(player.y + .8)
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(plane, point)) {
        const length = Math.hypot(point.x - player.x, point.z - player.z)
        if (length > .1) { input.current.aimX = (point.x - player.x) / length; input.current.aimZ = (point.z - player.z) / length }
      }
    }
    if (clickPending.current) {
      clickPending.current = false
      if (cameraEnabled) fire()
    }
  })
  return <>
    <StoneRumbleTiles tiles={state.tiles} material={material} time={state.serverTime} ownFloor={ownFloor} />
    <ArrivalClouds state={state} />
    {state.players.map((player, index) => <Avatar key={`${state.gameId}/${player.userId}`} localOnly={localOnly} player={player} index={index} own={player.userId === viewId} time={state.serverTime} gameId={state.gameId} feedback={feedback} />)}
    {state.pigeons.map(pigeon => <Pigeon key={pigeon.id} pigeon={pigeon} time={state.serverTime} />)}
    <group visible={false} userData={{ prepareWhenHidden: true }}>
      <Pigeon pigeon={{ id: -1, owner: ownId, x: 0, y: 24.8, z: 0, vx: 20, vz: 0 }} time={0} />
    </group>
  </>
}

type StoneRumbleSceneProps = Parameters<typeof Stage>[0] & {
  onStatus: StoneSceneStatus; preparationAttempt: number; paused: boolean; sceneReady: boolean
}

export const StoneRumbleScene = memo(function StoneRumbleScene({ onStatus, preparationAttempt, paused, sceneReady, ...props }: StoneRumbleSceneProps) {
  const playScene = useMemo(() => { const scene = new Scene(); scene.name = 'stone-rumble-play'; return scene }, [])
  return <div className="stone-rumble-scene" data-view-id={props.viewId} data-camera="orbit" aria-label="현재 층 중심 돌탑 경기장">
    <SceneBoundary key={preparationAttempt} onStatus={onStatus}>
      <Canvas dpr={1} frameloop={paused ? 'demand' : 'always'} events={gameEvents} camera={{ position: [0, 42, 7.5], fov: 50, near: .1, far: 800 }} gl={{ alpha: false, antialias: true }}>
        {!sceneReady && <SceneBoundary><Suspense fallback={null}>
          <group name="stone-rumble-backdrop-source">
            <EnvironmentScene />
            <ParkSun quality="low" />
            <StoneRumbleEnvironment />
          </group>
        </Suspense></SceneBoundary>}
        <Suspense fallback={null}>
          {createPortal(<><StoneRumbleLighting /><Stage {...props} /></>, playScene)}
          <StoneRumblePreparation onStatus={onStatus} playScene={playScene} />
        </Suspense>
      </Canvas>
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
