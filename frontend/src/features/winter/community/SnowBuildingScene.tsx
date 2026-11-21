import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, SphereGeometry, TorusGeometry, type Group, type InstancedMesh, Object3D } from 'three'
import { PropBuilder } from '../../../world/art/propGeometry'
import { groundSurfaceHeight } from '../../../../park-renewal-preview/groundSurface'
import { useWinterCommunity, type Snowman } from './state'
import { useWinterCommunityPanel } from './panelState'
import { snowmanLayout } from './snowmanLayout'

const colors = { RED: '#b73746', GREEN: '#28754a', BLUE: '#366caa', GOLD: '#cca641' }
type Model = Pick<Snowman, 'baseRadius' | 'middleRadius' | 'headRadius' | 'hat' | 'scarf' | 'face'>
function snowmanArt(man: Model) {
  const b = new PropBuilder(), { baseRadius: a, middleRadius: m, headRadius: h } = man
  const { middleY: middle, headY: head, height: top } = snowmanLayout(a, m, h)
  const sphere = (color: string, x: number, y: number, z: number, r: number) => {
    const body = r >= .25
    b.add('paint', new SphereGeometry(r, body ? 20 : 10, body ? 14 : 6), color, [x, y, z], [1, 1, 1], [0, 0, 0], false, body)
  }
  sphere('#f2f8ff', 0, a, 0, a); sphere('#f2f8ff', 0, middle, 0, m); sphere('#f2f8ff', 0, head, 0, h)
  sphere('#242d39', -h * .32, head + h * .18, h * .91, h * .065)
  if (man.face === 'SMILE') sphere('#242d39', h * .32, head + h * .18, h * .91, h * .065)
  else b.add('paint', new CylinderGeometry(h * .028, h * .028, h * .18, 5), '#242d39', [h * .32, head + h * .18, h * .92], [1, 1, 1], [0, 0, Math.PI / 2])
  b.add('paint', new CylinderGeometry(0, h * .095, h * .55, 8), '#e78c3d', [0, head - h * .05, h * 1.1], [1, 1, 1], [Math.PI / 2, 0, 0])
  for (let i = 0; i < 5; i++) { const x = (i - 2) * h * .13; sphere('#35434b', x, head - h * (.38 - Math.abs(i - 2) * .055), Math.sqrt(h * h - x * x) * .93, h * .028) }
  for (let i = 0; i < 3; i++) sphere('#38404a', 0, middle + m * (.4 - i * .4), m * .96, m * .065)
  const scarf = colors[man.scarf]
  b.add('paint', new TorusGeometry(h * .85, h * .16, 7, 22), scarf, [0, head - h * .7, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
  b.box('paint', scarf, [h * .3, head - h * 1.35, m * .85], [h * .35, h * .9, h * .12], [0, 0, -.12])
  for (const sign of [-1, 1]) b.add('wood', new CylinderGeometry(.025, .035, m * 1.6, 6), '#694b38', [sign * m * 1.35, middle + m * .15, 0], [1, 1, 1], [0, 0, sign * -Math.PI / 2.7])
  if (man.hat === 'TOP_HAT') {
    b.add('paint', new CylinderGeometry(h * 1.05, h * 1.05, h * .12, 20), '#223947', [0, top - h * .05, 0])
    b.add('paint', new CylinderGeometry(h * .66, h * .72, h * .9, 20), '#223947', [0, top + h * .42, 0])
    b.add('paint', new CylinderGeometry(h * .73, h * .73, h * .16, 20), scarf, [0, top + h * .09, 0])
  } else if (man.hat === 'BEANIE') {
    b.add('paint', new SphereGeometry(h * .9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), scarf, [0, head + h * .58, 0])
    b.add('paint', new TorusGeometry(h * .88, h * .12, 7, 20), scarf, [0, head + h * .58, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
    sphere('#ffefd5', 0, top + h * .5, 0, h * .19)
  }
  return b.finish()
}

function SnowmanModel({ man, ghost = false }: { man: Model; ghost?: boolean }) {
  const art = useMemo(() => snowmanArt(man), [man.baseRadius, man.middleRadius, man.headRadius, man.hat, man.scarf, man.face])
  useEffect(() => () => { Object.values(art).forEach(g => g?.dispose()) }, [art])
  return <group>{Object.entries(art).map(([key, geometry]) => <mesh key={key} geometry={geometry} dispose={null} castShadow={!ghost} receiveShadow raycast={() => {}}>
    <meshStandardMaterial vertexColors roughness={.85} transparent={ghost} opacity={ghost ? .4 : 1} depthWrite={!ghost} />
  </mesh>)}</group>
}

function RollingSnow() {
  const mesh = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), [])
  const poses = useRef(new Map<string, { x: number; y: number; z: number; r: number }>())
  useFrame((_, dt) => {
    if (!mesh.current) return
    const balls = useWinterCommunity.getState().building?.balls ?? [], active = new Set(balls.map(b => b.id))
    for (const id of poses.current.keys()) if (!active.has(id)) poses.current.delete(id)
    for (let i = 0; i < 24; i++) {
      const ball = balls[i]
      dummy.scale.setScalar(0)
      if (ball) {
        const p = poses.current.get(ball.id) ?? { x: ball.x, y: ball.groundY + ball.radius, z: ball.z, r: ball.radius }
        const blend = 1 - Math.exp(-dt * 14)
        p.x += (ball.x - p.x) * blend; p.y += (ball.groundY + ball.radius - p.y) * blend
        p.z += (ball.z - p.z) * blend; p.r += (ball.radius - p.r) * blend
        poses.current.set(ball.id, p); dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(p.r)
      }
      dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} name="winter-rolling-snow" args={[undefined, undefined, 24]} frustumCulled={false} castShadow receiveShadow raycast={() => {}}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#edf6ff" roughness={.92} /></instancedMesh>
}

export function SnowBuildingScene() {
  const snowmen = useWinterCommunity(s => s.building?.snowmen)
  const preview = useWinterCommunityPanel(s => s.preview), workshop = useWinterCommunityPanel(s => s.workshop)
  const ghost = useRef<Group>(null)
  return <group name="winter-community-snow"><RollingSnow />
    {snowmen?.map(man => <group key={man.id} name={'built-snowman-' + man.id} position={[man.x, man.groundY, man.z]} rotation={[0, man.yaw, 0]}><SnowmanModel man={man} /></group>)}
    {preview && workshop && <group ref={ghost} name="snowman-placement-preview" position={[preview.x, groundSurfaceHeight(preview.x, preview.z), preview.z]} rotation={[0, preview.yaw, 0]}><SnowmanModel ghost man={{ ...preview, baseRadius: workshop.base, middleRadius: workshop.middle, headRadius: workshop.head }} /></group>}
  </group>
}
