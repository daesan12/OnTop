import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import { PropBuilder, type XYZ } from '../../world/art/propGeometry'
import { StaticArt } from './parts'
import { RaffleLiveMachine } from './RaffleLiveMachine'

export type CameraView = 'front' | 'side' | 'back' | 'display' | 'board' | 'far'
export const CAMERA_VIEWS: Record<CameraView, { label: string; position: XYZ; target: XYZ }> = {
  // 우측 조작 패널에 결과판이 가리지 않도록 시선을 오른쪽으로 옮긴다.
  front: { label: '정면', position: [2.4, 3.1, 13.5], target: [2.4, 2.7, 0] },
  side: { label: '측면 45°', position: [10.5, 4.2, 10], target: [.8, 2.5, 0] },
  back: { label: '후면', position: [-3, 4.4, -12.5], target: [0, 2.5, 0] },
  display: { label: '닉네임 창', position: [1.1, 3, 6.6], target: [1.1, 2.9, 0] },
  board: { label: '결과판', position: [7.6, 2.7, 6.2], target: [5.3, 2.3, 1] },
  far: { label: '관람 거리 22m', position: [3.4, 2.4, 22], target: [3.4, 2.6, 0] },
}

/** 프리뷰 배경 마당: 포장 바닥과 단풍나무(기계 모형 아님) */
function buildPlaza() {
  const b = new PropBuilder()
  b.cylinder('stone', '#d8cbb2', [0, -.05, 2], 26, 26, .1, [0, 0, 0], 24)
  b.cylinder('stone', '#cdbfa5', [0, -.04, 2], 15, 15, .1, [0, 0, 0], 24)
  const trees: [number, number, string][] = [[-11, -6, '#e0a63a'], [-7, -10, '#d9822b'], [8, -9, '#e6b847'], [12, -4, '#d27a2a'],
    [-14, 4, '#c9a23a'], [15, 6, '#e0a63a'], [-3, -13, '#7f9a4a'], [4, -14, '#d9822b']]
  for (const [x, z, color] of trees) {
    b.cylinder('wood', '#6b4a2f', [x, 1.4, z], .22, .3, 2.8, [0, 0, 0], 6)
    b.ball('paint', color, [x, 3.8, z], [2.1, 1.9, 2.1])
    b.ball('paint', color, [x + .9, 3.2, z + .4], [1.3, 1.2, 1.3])
  }
  return b.finish()
}
const PLAZA = buildPlaza()

function CameraRig({ view }: { view: { name: CameraView; n: number } }) {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const goal = useRef<{ position: Vector3; target: Vector3 } | null>(null)
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    orbit.maxPolarAngle = Math.PI * .495
    orbit.minDistance = 3
    orbit.maxDistance = 45
    orbit.target.set(...CAMERA_VIEWS.front.target)
    orbit.addEventListener('start', () => { goal.current = null })
    controls.current = orbit
    return () => orbit.dispose()
  }, [camera, gl])
  useEffect(() => {
    const preset = CAMERA_VIEWS[view.name]
    goal.current = { position: new Vector3(...preset.position), target: new Vector3(...preset.target) }
  }, [view])
  useFrame((_, delta) => {
    const orbit = controls.current
    if (!orbit) return
    const target = goal.current
    if (target) {
      const k = 1 - Math.exp(-5 * Math.min(delta, .1))
      camera.position.lerp(target.position, k)
      orbit.target.lerp(target.target, k)
      if (camera.position.distanceTo(target.position) < .01) goal.current = null
    }
    orbit.update()
  })
  return null
}

/** 공원과 분리된 단독 장면. 공원 지도·물리·네트워크를 불러오지 않는다. */
export function PreviewScene({ machineKey, view }: { machineKey: number; view: { name: CameraView; n: number } }) {
  return <Canvas className="rl-canvas" shadows={!SIMPLE_MAP} dpr={[1, 1.75]}
    camera={{ position: CAMERA_VIEWS.front.position, fov: 45, near: .1, far: 400 }}>
    <color attach="background" args={['#cfe3f1']} />
    <fog attach="fog" args={['#cfe3f1', 45, 140]} />
    <hemisphereLight args={['#fff1dc', '#7d6a52', 1.05]} />
    <ambientLight intensity={.2} />
    <directionalLight position={[9, 15, 11]} intensity={2} color="#ffecd0" castShadow={!SIMPLE_MAP}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14}
      shadow-camera-bottom={-14} shadow-bias={-.0004} />
    <StaticArt art={PLAZA} name="raffle-live-preview-plaza" />
    <RaffleLiveMachine key={machineKey} />
    <CameraRig view={view} />
  </Canvas>
}
