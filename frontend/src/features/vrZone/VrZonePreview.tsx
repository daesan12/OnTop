import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { PARK_LAYOUT } from '../../map/park'
import { vrBoothArt } from '../../world/art/activityPropGeometry'
import { vrEntrance } from './anchors'
import './preview.css'

const site = PARK_LAYOUT.SITES.vr
const yaw = PARK_LAYOUT.VR_YAW
const entrance = vrEntrance(site, yaw)

export function VrZonePreview() {
  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.target instanceof Element && event.target.closest('input,textarea,button,a,[contenteditable=true]')) return
      if (event.code === 'KeyE') { event.preventDefault(); window.location.assign('./skewer.html') }
    }
    window.addEventListener('keydown', interact)
    return () => { window.removeEventListener('keydown', interact) }
  }, [])
  return <main className="vr-zone-preview" aria-label="VR 체험관 로컬 미리보기">
    <header><div><h1>VR 체험관</h1><p>최신 공원 VR 한옥 · 입구 상호작용 미리보기</p></div><span>로컬 테스트 · 실제 엽전 차감 없음</span></header>
    <div className="vr-zone-preview-scene" aria-label="현재 공원의 VR 한옥 모델">
      <Canvas camera={{ position: [site.x + Math.sin(yaw) * 19 + Math.cos(yaw) * 10, 10, site.z + Math.cos(yaw) * 19 - Math.sin(yaw) * 10], fov: 43, near: .1, far: 100 }} onCreated={({ camera }) => { camera.lookAt(site.x, 1.7, site.z) }} gl={{ antialias: true }}>
        <color attach="background" args={['#c8ddd3']} /><hemisphereLight args={['#fff5dc', '#708267', 2]} /><directionalLight position={[site.x + 7, 16, site.z + 10]} intensity={2.8} />
        <mesh rotation-x={-Math.PI / 2} position={[site.x, -.03, site.z]}><planeGeometry args={[50, 50]} /><meshLambertMaterial color="#889b70" /></mesh>
        <mesh rotation-x={-Math.PI / 2} position={[site.x, -.01, site.z]}><planeGeometry args={[PARK_LAYOUT.VR_COURT.width, PARK_LAYOUT.VR_COURT.depth]} /><meshLambertMaterial color="#d2c9ad" /></mesh>
        <group position={[site.x, 0, site.z]} rotation-y={yaw}>{Object.entries(vrBoothArt).map(([finish, geometry]) => <mesh key={finish} geometry={geometry} dispose={null}><meshLambertMaterial vertexColors /></mesh>)}</group>
        <mesh rotation-x={-Math.PI / 2} position={[entrance.x, .025, entrance.z]}><ringGeometry args={[.8, 1, 40]} /><meshBasicMaterial color="#ca9c49" /></mesh>
      </Canvas>
    </div>
    <div className="vr-zone-preview-entry"><strong>온탑 꼬치왕 무료 연습</strong><p>이 화면은 개발용 연습 입구예요. 공원 VR 체험관에서는 무료 2인 협동을 즐길 수 있어요.</p><a href="./skewer.html" aria-keyshortcuts="E"><kbd>E</kbd> 무료 연습 열기</a></div>
  </main>
}
