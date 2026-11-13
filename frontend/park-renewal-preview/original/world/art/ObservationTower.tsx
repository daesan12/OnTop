import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { cameraWorldPosition } from '../../../../src/world/xrView'
import { BufferGeometry, Float32BufferAttribute, type Mesh } from 'three'
import { OBSERVATION_TOWER as TOWER, createTowerRamp, createTowerDeck } from '../../../../src/config'
import { Instances, beam, type Part } from '../../../../src/world/art/Instances'
import { SurfaceMaterial } from '../../../../src/world/art/SurfaceMaterial'
import { createTowerFrame } from './towerFrameGeometry'

const rampData = createTowerRamp(),
  ramp = new BufferGeometry()
ramp.setAttribute('position', new Float32BufferAttribute(rampData.vertices, 3))
ramp.setIndex(Array.from(rampData.indices))
ramp.setAttribute(
  'uv',
  new Float32BufferAttribute(
    Array.from({ length: rampData.vertices.length / 3 }, (_, i) => [
      i % 2,
      i / 24,
    ]).flat(),
    2,
  ),
)
ramp.computeVertexNormals()
const deckData = createTowerDeck(),
  deck = new BufferGeometry()
deck.setAttribute('position', new Float32BufferAttribute(deckData.vertices, 3))
deck.setIndex(Array.from(deckData.indices))
deck.setAttribute(
  'uv',
  new Float32BufferAttribute(
    Array.from({ length: deckData.vertices.length / 3 }, (_, i) => [
      deckData.vertices[i * 3]! / 2,
      deckData.vertices[i * 3 + 2]! / 2,
    ]).flat(),
    2,
  ),
)
deck.computeVertexNormals()
const columns: Part[] = []
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6
  columns.push(
    beam(
      [TOWER.x + Math.cos(a) * 4.8, 0, TOWER.z + Math.sin(a) * 4.8],
      [
        TOWER.x + Math.cos(a) * 4.8,
        TOWER.height - 0.08,
        TOWER.z + Math.sin(a) * 4.8,
      ],
      0.26,
      '#756044',
    ),
  )
}
/** Shared tower art; callers may translate the entire existing model for layout review. */
export function ObservationTower({children,verticalScale=1,frameGeometry,distantFrame,frameCenter}:{children?:ReactNode;verticalScale?:number;frameGeometry?:BufferGeometry;distantFrame?:BufferGeometry;frameCenter?:{x:number;z:number}}={}) {
  const towerFrame = useMemo(() => frameGeometry ?? createTowerFrame(verticalScale), [frameGeometry, verticalScale])
  const full = useRef<Mesh>(null), proxy = useRef<Mesh>(null)
  const detailed = useRef(false)
  useFrame(({ camera }) => {
    if (!frameCenter || !full.current || !proxy.current) return
    const view = cameraWorldPosition(camera)
    const distance = Math.hypot(view.x - frameCenter.x, view.z - frameCenter.z)
    detailed.current = distance < (detailed.current ? 72 : 60)
    full.current.visible = detailed.current
    proxy.current.visible = !detailed.current
  }, .65)
  return (
      <group name="spiral-observation-tower">
        <mesh
          name="tower-walkway-floor"
          userData={{ keepOpaque: true, prepareEntranceProgram: !!distantFrame }}
          geometry={ramp}
          receiveShadow
          dispose={null}
        >
          <SurfaceMaterial kind="wood" color="#bd9f6a" side={2} />
        </mesh>
        <mesh
          ref={full}
          visible={!distantFrame}
          name="tower-frame-merged"
          userData={{ keepOpaque: true }}
          geometry={towerFrame}
          dispose={null}
          receiveShadow
        >
          <SurfaceMaterial kind="wood" strength={0.2} vertexColors />
        </mesh>
        {distantFrame && <mesh ref={proxy} name="tower-frame-distant" geometry={distantFrame}
          userData={{ keepOpaque: true, distanceProxy: true, prepareEntranceProgram: true }} raycast={() => {}} dispose={null} receiveShadow>
          <SurfaceMaterial kind="wood" strength={0.2} vertexColors />
        </mesh>}
        <Instances
          parts={columns}
          shadow={false}
          material={<SurfaceMaterial kind="wood" />}
        >
          <cylinderGeometry args={[1, 1, 1, 8]} />
        </Instances>
        <mesh
          name="tower-top-floor"
          userData={{ keepOpaque: true, prepareEntranceProgram: !!distantFrame }}
          geometry={deck}
          dispose={null}
        >
          <SurfaceMaterial kind="wood" color="#aa8955" side={2} />
        </mesh>
        {children}
      </group>
  )
}
