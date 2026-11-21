import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, CanvasTexture, ExtrudeGeometry, PerspectiveCamera, Shape, SRGBColorSpace, type Group } from 'three'
import type { YutThrow } from './contracts'
import { StickResult } from './StickResult'
import { fitThrowCamera, STICK_LENGTH, STICK_RADIUS, THROW_DURATION, throwPose } from './throwMotion'
import './yutThrow.css'

type ThrowProps = { result: YutThrow | null; animating: boolean; waiting: boolean; expanded?: boolean }
class ThrowBoundary extends Component<{ children: ReactNode; result: YutThrow | null }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="yut-throw-fallback"><span>윷가락 결과</span>{this.props.result && <StickResult mask={this.props.result.mask} />}</div> : this.props.children
  }
}
export function YutThrow3D({ result, animating, waiting, expanded = animating }: ThrowProps) {
  const backdo = !!result && !result.out && result.steps === -1
  return <section className="yut-throw-view" data-animating={animating} data-expanded={expanded} data-result-id={result?.id ?? 0}
    data-mask={animating ? undefined : result?.mask} aria-label="윷 던지기와 마지막 결과">
    <div className="yut-throw-stage">
      <ThrowBoundary result={result}><ThrowCanvas result={result} animating={animating} waiting={waiting} /></ThrowBoundary>
      <div className="yut-throw-caption" role="status" aria-atomic="true" data-backdo={backdo && !animating} data-out={result?.out && !animating}>
        <strong>{animating ? waiting ? '윷을 던지고 있어요…' : '윷가락이 굴러가고 있어요…' : result ? backdo && !result.opening ? '빽도 · 뒤로 1칸' : result.name : '윷가락을 던져보세요'}</strong>
        <small>{animating ? '윷가락이 멈추면 말을 골라주세요.' : !result ? '붉은 − 표식이 있는 윷을 확인하세요.' : result.opening ? '선공 결정 결과 · 높은 결과의 팀이 먼저 시작해요.' : result.out ? '멍석 밖 · 이동권 없이 차례를 넘겨요.' : backdo ? '붉은 − 표식 윷만 평평한 면 위' : result.bonus ? '한 번 더 던져요!' : `앞으로 ${result.steps}칸`}</small>
      </div>
    </div>
  </section>
}
function ThrowCanvas(props: ThrowProps) {
  const [lost, setLost] = useState(false)
  if (lost) throw new Error('Yut throw WebGL context lost')
  return <Canvas frameloop="demand" shadows dpr={[1, 1.5]} camera={{ position: [0, 5.4, 4.6], fov: 38 }}
    gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }} aria-hidden="true"
    onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.1 }}>
    <ThrowScene {...props} onLost={() => setLost(true)} />
  </Canvas>
}
function ThrowScene({ result, animating, waiting, onLost }: ThrowProps & { onLost(): void }) {
  const { camera, gl, invalidate, size } = useThree()
  useLayoutEffect(() => {
    if (camera instanceof PerspectiveCamera) fitThrowCamera(camera, size.width, size.height, animating, result?.mask ?? 0, result?.id ?? 0, result?.out)
    invalidate()
  }, [camera, size.width, size.height, animating, result?.id, result?.mask, result?.out, invalidate])
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  const geometry = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(-STICK_RADIUS, 0); shape.lineTo(STICK_RADIUS, 0)
    shape.absarc(0, 0, STICK_RADIUS, 0, Math.PI, false); shape.closePath()
    const g = new ExtrudeGeometry(shape, { depth: STICK_LENGTH, steps: 1, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2, curveSegments: 24 })
    g.translate(0, -STICK_RADIUS / 2, -STICK_LENGTH / 2)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <>
    <hemisphereLight args={['#fff4d8', '#3d3924', 1.5]} />
    <directionalLight position={[-3, 7, -3]} intensity={3} castShadow shadow-mapSize={[512, 512]}
      shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-normalBias={.02} />
    <mesh position={[0, -.04, 0]} receiveShadow><boxGeometry args={[4.55, .15, 3.25]} /><meshStandardMaterial color="#a58550" roughness={.95} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .04, 0]} receiveShadow><planeGeometry args={[4.4, 3.1]} /><meshStandardMaterial color="#dad0a6" roughness={1} /></mesh>
    {[0, 1, 2, 3].map(index => <TumblingStick key={index} index={index} result={result} animating={animating} waiting={waiting} geometry={geometry} />)}
  </>
}
function useWood(marked: boolean, curved = false) {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1536
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 256, 0)
    gradient.addColorStop(0, '#a76e31'); gradient.addColorStop(.25, '#e5bd78'); gradient.addColorStop(.7, '#d6a961'); gradient.addColorStop(1, '#b57c38')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 1536)
    for (let line = 0; line < 24; line++) {
      ctx.strokeStyle = line % 3 ? '#774c2125' : '#fff0ba50'; ctx.lineWidth = line % 3 ? 2 : 3
      ctx.beginPath()
      for (let y = 0; y <= 1536; y += 16) {
        const x = line * 12 + Math.sin(y / 160 + line * 3) * 8
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    if (!curved) {
      ctx.strokeStyle = '#755026'; ctx.lineWidth = 12
      ctx.strokeRect(18, 45, 220, 1446)
      if (marked) {
        ctx.fillStyle = '#a22e25'; ctx.fillRect(14, 600, 228, 336)
        ctx.strokeStyle = '#fff2d8'; ctx.lineWidth = 6; ctx.strokeRect(23, 612, 210, 312)
        ctx.fillStyle = '#fff8e9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = '900 205px sans-serif'; ctx.fillText('−', 128, 780)
      } else {
        ctx.strokeStyle = '#654523'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(128, 620); ctx.lineTo(128, 916); ctx.stroke()
      }
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
    return texture
  }, [marked, curved])
  useEffect(() => { map.needsUpdate = true; return () => map.dispose() }, [map])
  return map
}
function TumblingStick({ index, result, animating, waiting, geometry }: ThrowProps & { index: number; geometry: ExtrudeGeometry }) {
  const group = useRef<Group>(null), start = useRef(performance.now())
  const invalidate = useThree(state => state.invalidate)
  const body = useWood(false, true), flat = useWood(index === 0)
  useLayoutEffect(() => { start.current = performance.now(); invalidate() }, [result?.id, animating, waiting, invalidate])
  useFrame(() => {
    if (!group.current) return
    const elapsed = (performance.now() - start.current) / 1000
    const pose = throwPose(animating && !waiting ? elapsed : THROW_DURATION, index, result?.mask ?? 0, result?.id ?? 0, result?.out)
    if (waiting) {
      pose.position[1] += .15 + .08 * Math.sin(elapsed * 8 + index)
      pose.rotation[0] += .08 * Math.sin(elapsed * 6 + index)
    }
    group.current.position.set(...pose.position)
    group.current.rotation.set(...pose.rotation, 'YXZ')
    if (animating) invalidate()
  })
  return <group ref={group}>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial map={body} roughness={.65} metalness={.02} /></mesh>
    <mesh position={[0, -STICK_RADIUS / 2 - .014, 0]} rotation={[Math.PI / 2, 0, Math.PI]} receiveShadow>
      <planeGeometry args={[STICK_RADIUS * 2, STICK_LENGTH]} /><meshStandardMaterial map={flat} roughness={.65} />
    </mesh>
  </group>
}
