import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TABLES, tableScale, tableSeats } from '../../park/mapConfig'
import { useSession } from '../../network/worldClient'
import { tabletLobbyActive } from './tabletModel'
import { screenTransform, TABLET, tabletProjection } from './tabletProjection'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'
import { renderedTableAnchors } from './tabletAnchors'

const caseGeometry = new RoundedBoxGeometry(TABLET.width + .14, TABLET.height + .14, .08, 2, .025)
const inlayGeometry = new RoundedBoxGeometry(TABLET.width + .108, TABLET.height + .108, .012, 2, .006)
const bezelGeometry = new RoundedBoxGeometry(TABLET.width + .075, TABLET.height + .075, .012, 2, .006)

/** Physical wood/bezel/stand in the existing scene; the screen is accessible projected HTML. */
export function TableTablet3D() {
  const own = useSession(s => s.tableId), seatIndex = useSession(s => s.seatIndex)
  const binding = useSession(s => s.bindings.find(b => b.channelId === s.roomId && b.tableId === own))
  const anchor = binding && (renderedTableAnchors.get(binding.anchorId) ?? TABLES.find(t => t.id === binding.anchorId))
  if (!anchor || seatIndex < 0) return null
  return <TabletAsset key={`${own}/${seatIndex}`} anchor={anchor} seatIndex={seatIndex} />
}
function TabletAsset({ anchor, seatIndex }: { anchor: typeof TABLES[number]; seatIndex: number }) {
  const root = useRef<Group>(null), screen = useRef<Group>(null), power = useRef(0)
  const reduced = useRef(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { reduced.current = media.matches }
    change(); media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const seat = tableSeats(anchor)[seatIndex] ?? tableSeats(anchor)[0]!
  const yaw = Math.atan2(seat.x, seat.z), scale = tableScale(anchor)
  const points = useMemo(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], [])
  const projected = useMemo(() => Array.from({ length: 4 }, () => ({ x: 0, y: 0 })), [])
  useFrame(({ camera, size }, delta) => {
    if (!root.current || !screen.current) return
    const active = tabletLobbyActive(), target = active ? 1 : 0
    if (reduced.current) power.current = target
    else power.current += (target - power.current) * (1 - Math.exp(-12 * Math.min(delta, .1)))
    const amount = power.current
    tabletProjection.amount = amount
    root.current.visible = amount > .005
    root.current.position.y = anchor.position[1] + (anchor.boardOffsetY ?? 0) + 1.06 + (TABLET.y - 1.06) * scale - (1 - amount) * .58
    root.current.scale.setScalar(scale * Math.max(.02, amount))
    root.current.updateWorldMatrix(true, true)
    camera.updateMatrixWorld()
    const element = tabletProjection.element
    if (!element) return
    element.style.visibility = active && amount > .4 ? 'visible' : 'hidden'
    element.style.opacity = String(Math.max(0, (amount - .45) / .55))
    if (size.width < 800 || size.height < 550) { element.style.transform = ''; return }
    const positions = [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const
    for (let i = 0; i < 4; i++) {
      const [x, y] = positions[i]!
      points[i]!.set(x * TABLET.width / 2, y * TABLET.height / 2, TABLET.screenDepth)
      screen.current.localToWorld(points[i]!); points[i]!.project(camera)
      projected[i]!.x = (points[i]!.x + 1) * size.width / 2
      projected[i]!.y = (1 - points[i]!.y) * size.height / 2
    }
    element.style.transform = screenTransform(projected)
  })
  return <group ref={root} name="table-preparation-tablet" position={[anchor.position[0], anchor.position[1] + TABLET.y, anchor.position[2]]}
    rotation={[0, yaw, 0]} userData={{ assetId: 'table-preparation-tablet', keepOpaque: true }}>
    <group ref={screen} rotation={[TABLET.tilt, 0, 0]}>
      <mesh><primitive object={caseGeometry} attach="geometry" dispose={null} /><SurfaceMaterial kind="wood" mapping="box" color="#765238" meters={.65} /></mesh>
      <mesh position={[0, 0, .043]}><primitive object={inlayGeometry} attach="geometry" dispose={null} /><meshStandardMaterial color="#b49a66" roughness={.8} metalness={.12} /></mesh>
      <mesh position={[0, 0, .052]}><primitive object={bezelGeometry} attach="geometry" dispose={null} /><meshStandardMaterial color="#29382e" roughness={.86} /></mesh>
      <mesh position={[0, 0, TABLET.screenDepth - .001]}><planeGeometry args={[TABLET.width, TABLET.height]} /><meshBasicMaterial color="#233126" /></mesh>
      <mesh position={[0, TABLET.height / 2 + .02, TABLET.screenDepth]}><circleGeometry args={[.004, 12]} /><meshBasicMaterial color="#bca675" /></mesh>
    </group>
    <mesh position={[0, -.55, -.05]} scale={[1.04, .035, .39]}><BeveledBox /><SurfaceMaterial kind="wood" mapping="box" color="#765238" /></mesh>
    <mesh position={[0, -.35, -.13]} rotation={[-.35, 0, 0]} scale={[.65, .42, .055]}><BeveledBox /><SurfaceMaterial kind="wood" mapping="box" color="#8b5c35" /></mesh>
  </group>
}
