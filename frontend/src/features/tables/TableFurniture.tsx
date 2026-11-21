import { STONE_RUMBLE_ANCHOR_ID } from '../../game/stone-rumble/entrance'
import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import { useMemo, type ReactNode } from 'react'

import { GOMOKU, TABLE_SEATS } from '../../config'
import { tableScale, tableSeats, type TableAnchor } from '../../park/tablePlacement'
import { interactWithTable } from '../tableLobby/tableInteraction'
import { Instances, yawPart, type Part } from '../../world/art/Instances'

import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'
import { PavilionWoodTable } from './PavilionWoodTable'
import { StonePicnicTable } from './StonePicnicTable'
import { MainPavilionTable } from './MainPavilionTable'
import { usePresentedChairCount } from '../tableLobby/useTablePresentation'

/** Stable game/seat anchors survive replacement of the visual table subtree. */
export function TableFurniture({ anchor, onInspect = interactWithTable, nativeFurniture = false, children }: {
  anchor: TableAnchor; onInspect?: (id: string) => void; nativeFurniture?: boolean; children?: ReactNode
}) {
  const fourSeats = true
  const stoneGameTable = anchor.assetId === 'procedural/stone-game-table'
  const mainPavilion = anchor.pavilionId === 'P0'
  const seatCount = usePresentedChairCount(anchor)
  const parts = useMemo(() => {
    if(anchor.assetId==='procedural/vr-stone-game-table'){
      const stone:Part[]=[{p:[0,.94,0],s:[2.4,.24,1.5],c:'#bebcae'}]
      for(const x of [-.72,.72])stone.push({p:[x,.4,0],s:[.38,.8,.9],c:'#aaa99c'})
      for(const seat of tableSeats(anchor).slice(0,seatCount)){
        stone.push({p:[seat.x,.45,seat.z],s:[1.05,.22,.85],r:[0,seat.yaw,0],c:'#bebcae'},
          {p:[seat.x,.19,seat.z],s:[.65,.38,.55],r:[0,seat.yaw,0],c:'#aaa99c'},
          {p:[seat.x-Math.sin(seat.yaw)*.37,.88,seat.z-Math.cos(seat.yaw)*.37],s:[1.05,.65,.15],r:[0,seat.yaw,0],c:'#bebcae'})
      }
      return {stone,supports:[]}
    }
    if(SIMPLE_MAP && anchor.pavilionId){
      const stone:Part[]=[{p:[0,.99,0],s:[2.1,.14,1.6],c:'#bb956c'}]
      const supports:Part[]=[]
      for(const x of [-.8,.8])for(const z of [-.58,.58])supports.push({p:[x,.44,z],s:[.15,.88,.15],c:'#795538'})
      for(const seat of TABLE_SEATS.slice(0,seatCount)){
        stone.push({p:[seat.x,.515,seat.z],s:[.72,.09,.66],r:[0,seat.yaw,0],c:'#bb956c'})
        const back:Part={p:[seat.x-Math.sin(seat.yaw)*.29,.94,seat.z-Math.cos(seat.yaw)*.29],s:[.72,.34,.1],c:'#a47b52'}
        yawPart(back,seat.yaw);stone.push(back)
        supports.push({p:[seat.x,.235,seat.z],s:[.48,.47,.43],r:[0,seat.yaw,0],c:'#795538'})
      }
      return {stone,supports}
    }
    const stone: Part[] = [
      { p: [0, 0.99, 0], s: [2.1, 0.14, 1.6], c: '#c7c6b9' },
    ]
    const supports: Part[] = []
    for (const x of [-0.7, 0.7])
      supports.push({ p: [x, 0.46, 0], s: [0.28, 0.92, 1.15], c: '#545e57' })
    for (const z of GOMOKU.seatZ) {
      stone.push({ p: [0, 0.48, z], s: [2.1, 0.16, 0.52], c: '#c3c3b7' })
      for (const x of [-0.7, 0.7])
        supports.push({ p: [x, 0.2, z], s: [0.28, 0.4, 0.43], c: '#545e57' })
    }
    if (fourSeats)
      for (const { x, z } of TABLE_SEATS.slice(2, seatCount)) {
        stone.push({ p: [x, 0.48, z], s: [0.52, 0.16, 0.85], c: '#c3c3b7' })
        supports.push({ p: [x, 0.2, z], s: [0.32, 0.4, 0.6], c: '#545e57' })
      }
    if (anchor.id === STONE_RUMBLE_ANCHOR_ID) {
      for (const { x, z } of tableSeats(anchor).slice(4, seatCount)) {
        stone.push({ p: [x, .48, z], s: [.72, .16, .66], c: '#c3c3b7' })
        supports.push({ p: [x, .2, z], s: [.48, .4, .43], c: '#545e57' })
      }
    }
    return { stone, supports }
  }, [fourSeats, seatCount, anchor])
  return (
    <group
      scale={nativeFurniture ? 1 : [tableScale(anchor), 1, tableScale(anchor)]}
      name={anchor.id}
      position={[...anchor.position]}
      userData={{ assetId: anchor.assetId, simpleVisual: SIMPLE_MAP, presentedSeatCount: seatCount }}
      onClick={(event) => {
        event.stopPropagation()
        onInspect(anchor.id)
      }}
    >
      {anchor.id === STONE_RUMBLE_ANCHOR_ID && <mesh name="stone-rumble-table-paving"
        position={[0, -.065, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[.05, 2.75, 8]} />
        <meshLambertMaterial color="#477563" polygonOffset polygonOffsetFactor={-2} />
      </mesh>}
      {nativeFurniture ? (
        <>
          <mesh position={[0, 1.06 + (anchor.boardOffsetY ?? 0), 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[anchor.pavilionId === 'P0' ? 2.1 : 1.55, 24]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          {tableSeats(anchor, seatCount).slice(2, seatCount).map((seat, i) => {
            const height = anchor.seatSurfaceY ?? .56
            return <group key={i} position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw, 0]}>
              <mesh position={[0, height - .07, 0]}>
                <boxGeometry args={[.85, .14, .52]} />
                <SurfaceMaterial kind="wood" color="#b9824c" />
              </mesh>
              <mesh position={[0, (height - .14) / 2, 0]}>
                <boxGeometry args={[.32, height - .14, .32]} />
                <SurfaceMaterial kind="wood" color="#865739" />
              </mesh>
            </group>
          })}
        </>
      ) : anchor.picnicId ? (
        <StonePicnicTable seatCount={seatCount} />
      ) : !SIMPLE_MAP&&mainPavilion ? (
        <MainPavilionTable seatCount={seatCount} />
      ) : !SIMPLE_MAP&&anchor.pavilionId ? (
        <PavilionWoodTable seatCount={seatCount} />
      ) : (
        <>
          <Instances
            name={stoneGameTable ? 'stone-game-table-surfaces' : undefined}
            // Keep the optimized surface mounted when the server changes the seat count.
            capacity={stoneGameTable ? (anchor.id === STONE_RUMBLE_ANCHOR_ID ? 9 : 5) : undefined}
            parts={parts.stone}
            material={
              <SurfaceMaterial
                kind="stone"
                mapping="box"
                meters={1.25}
                color="#ffffff"
              />
            }
          >
            <BeveledBox />
          </Instances>
          <Instances
            parts={parts.supports}
            material={
              SIMPLE_MAP ? <meshLambertMaterial flatShading/> : <meshStandardMaterial metalness={0.35} roughness={0.62} />
            }
          >
            <boxGeometry />
          </Instances>
        </>
      )}
      {!nativeFurniture && anchor.id !== STONE_RUMBLE_ANCHOR_ID && seatCount > 4 && tableSeats(anchor, seatCount).slice(4, seatCount).map((seat, index) => <group
        key={`extra-chair-${index}`} name={`table-extra-chair-${index + 5}`} position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw, 0]}>
        <mesh position={[0, .49, 0]} castShadow receiveShadow><boxGeometry args={[.72, .14, .66]} /><SurfaceMaterial kind={anchor.picnicId ? 'stone' : 'wood'} /></mesh>
        <mesh position={[0, .21, 0]} castShadow><boxGeometry args={[.46, .42, .46]} /><SurfaceMaterial kind={anchor.picnicId ? 'stone' : 'wood'} /></mesh>
      </group>)}
      {children}
    </group>
  )
}
