import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Buildings } from './Buildings'
import { CityBackdrop, ParkEnvironment } from './CityBackdrop'
import { ScenicDetails } from './ScenicDetails'
import { FenceJumpPreview } from './FenceJumpPreview'
import { ParkDetailGeometry } from './ParkDetailGeometry'
import { detailCamera, detailProfileAsset, detailProfileFacility } from './parkDetailCamera'
import { fenceJumpRoute, type FenceJumpSite } from './fenceJump'
import type { Facility, ParkView } from './scene'
import { WINTER_DECOR } from '../src/features/winter/plan'
import { groundSurfaceHeight } from './groundSurface'

const query = new URLSearchParams(window.location.search)
const winterPreview = query.get('winter') === '1'
const holidayIds: Record<string, string> = { snowman: 'plaza-snowman', gifts: 'plaza-gifts', santa: 'santa' }
const winterAsset = WINTER_DECOR.find(d => d.id === holidayIds[query.get('holiday') ?? ''])
const WinterScene = lazy(() => import('../src/features/winter/WinterScene').then(module => ({ default: module.WinterScene })))
const detailMode = query.get('details-profile')
const detailAsset = detailMode === 'before' || detailMode === 'after' ? detailProfileAsset(query) : undefined
const ParkJumpCourse = lazy(() => import('./ParkJumpCourse'))
const StairWalkPreview = lazy(() => import('./StairWalkPreview'))
const stairWalk = detailAsset === 'stairs' && query.get('walk') === '1'
const stairLane = query.get('lane') === 'left' ? -2.04 : query.get('lane') === 'right' ? 2.04 : 0

interface ViewSelection {
  view: ParkView
  facility?: Facility
  jump?: FenceJumpAction
}

export interface FenceJumpAction {
  site: FenceJumpSite
  attempt: number
  onFinish: (landedOnFence: boolean) => void
}

function ParkCamera({ view, facility, jump }: ViewSelection) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)

  useLayoutEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.minDistance = 3
    orbit.maxDistance = 2100
    orbit.maxPolarAngle = Math.PI * 0.485
    controls.current = orbit
    return () => {
      orbit.dispose()
      controls.current = null
    }
  }, [camera, gl])

  useLayoutEffect(() => {
    const orbit = controls.current
    if (!orbit || !size.width || !size.height || !(camera instanceof PerspectiveCamera)) return
    const aspect = size.width / size.height
    const portrait = aspect < 0.9
    camera.fov = portrait ? 75 : 40
    camera.updateProjectionMatrix()
    const fovFactor = portrait ? Math.tan(75 * Math.PI / 360) / Math.tan(40 * Math.PI / 360) : 1
    const fit = Math.max(1, 1.2 / (aspect * fovFactor))

    if (jump) {
      const { center: [x, z], floor, direction } = fenceJumpRoute(jump.site)
      const inward = jump.site === 'fitness' ? 4 : 0
      orbit.target.set(x, floor + .9, z)
      camera.position.set(
        x + (direction[0] * inward - direction[1] * 6) * fit,
        floor + 4 * fit,
        z + (direction[1] * inward + direction[0] * 6) * fit,
      )
    } else if (detailAsset && view === 'overview' && detailProfileFacility(detailAsset) === facility?.id) {
      const detail = detailCamera(detailAsset, aspect)
      orbit.target.set(...detail.target)
      camera.position.set(...detail.position)
    } else if (winterPreview && winterAsset && facility?.id === 'plaza' && view === 'overview') {
      const { x, z, height } = winterAsset, floor = groundSurfaceHeight(x, z)
      const distance = (winterAsset.kind === 'gifts' ? 3.2 : 4.7) * fit
      orbit.target.set(x, floor + height * .5, z)
      camera.position.set(x + distance * .42, floor + height * .5 + distance * .20, z + distance)
    } else if (winterPreview && facility?.id === 'plaza' && view === 'overview') {
      orbit.target.set(0, 8, 39)
      camera.position.set(16 * fit, 16 * fit, 39 + 25 * fit)
    } else if (facility) {
      const [x, y, z] = facility.position
      const isTower = facility.id === 'tower'
      const range = Math.max(isTower ? 48 : 23, Math.max(...facility.halfSize) * 2.5) * fit
      const focusY = y + (isTower ? 22 : 3)
      orbit.target.set(x, focusY, z)
      if (view === 'plan') camera.position.set(x, focusY + range * 1.7, z + 0.01)
      else camera.position.set(x + range * 0.82, focusY + range * 0.82, z + range)
    } else if (view === 'plan') {
      camera.position.set(0, 355 * fit, 0.01)
      orbit.target.set(0, 4, 0)
    } else {
      if (portrait) camera.position.set(-165 * fit, 255 * fit, 245 * fit)
      else camera.position.set(-245 * fit, 195 * fit, 325 * fit)
      orbit.target.set(-5, 38, -10)
    }
    orbit.update()
  }, [camera, facility, jump, size.height, size.width, view])

  return null
}

class PreviewErrorBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const cameraOptions = { fov: 40, near: 2, far: 2800 }

const renderOptions = {
  antialias: true,
  toneMapping: ACESFilmicToneMapping,
  preserveDrawingBuffer: true,
}

function OriginalPark({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady])
  return <>
    <ParkEnvironment night={false} />
    <CityBackdrop />
    <directionalLight position={[-100, 190, 90]} intensity={2.2} color="#fff0d6" />
    <ScenicDetails />
    <Buildings />
    {winterPreview && <Suspense fallback={null}><WinterScene /></Suspense>}
    {detailAsset === 'jump' && <Suspense fallback={null}><ParkJumpCourse /></Suspense>}
    <ParkDetailGeometry jumpCourse={detailAsset === 'jump'} />
  </>
}

function WinterPreviewRender() {
  // 시설의 shader 준비 프레임 이후 실제 미리보기를 그리는 렌더 소유자다.
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 2)
  return null
}

export function mountOriginalPark(viewport: HTMLElement) {
  const mount = document.createElement('div')
  mount.className = 'park-scene'
  viewport.prepend(mount)
  const root = createRoot(mount)

  return new Promise<{ show: (view: ParkView, facility?: Facility, jump?: FenceJumpAction) => void }>((resolve, reject) => {
    const show = (view: ParkView, facility?: Facility, jump?: FenceJumpAction) => {
      root.render(<PreviewErrorBoundary onError={reject}>
        <Canvas
          camera={cameraOptions}
          dpr={[1, 1.25]}
          gl={renderOptions}
        >
          <ParkCamera view={view} facility={facility} jump={jump} />
          {winterPreview && <WinterPreviewRender />}
          <Suspense fallback={null}>
            <OriginalPark onReady={ready} />
            {stairWalk && view === 'overview' && facility?.id === 'pagoda' &&
              <Suspense fallback={null}><StairWalkPreview lane={stairLane} /></Suspense>}
            {jump && <FenceJumpPreview key={jump.attempt} site={jump.site} onFinish={jump.onFinish} />}
          </Suspense>
        </Canvas>
      </PreviewErrorBoundary>)
    }
    const ready = () => resolve({ show })
    show('overview')
  })
}
