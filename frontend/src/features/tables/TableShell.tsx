import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import { useMemo } from 'react'

import { GOMOKU, TABLE_SEATS, tableScale, tableSeats, type TableAnchor } from '../../config'
import { interactWithTable } from '../tableLobby/tableInteraction'
import { Instances, yawPart, type Part } from '../../world/art/Instances'

import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'
import { PavilionWoodTable } from './PavilionWoodTable'
import { StonePicnicTable } from './StonePicnicTable'
import { MainPavilionTable } from './MainPavilionTable'
import { OmokBoard } from '../../game/OmokBoard'
import { FarkleTable } from '../../game/farkle/FarkleTable'
import { OneCardBoard } from '../../game/onecard/OneCardBoard'
import { BridgeBoard } from '../../game/bridge/BridgeBoard'
import { LedgerTable } from '../../game/ledger/LedgerTable'
import { usePresentedChairCount } from '../tableLobby/useTablePresentation'
import {DebrisGameSurface} from '../parkDebris/presentation'

/** Stable game/seat anchors survive replacement of the visual table subtree. */
export function TableShell({ anchor, onInspect = interactWithTable }: {
  anchor: TableAnchor; onInspect?: (id: string) => void
}) {
  const fourSeats = true
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
    return { stone, supports }
  }, [fourSeats, seatCount, anchor])
  return (
    <group
      scale={[tableScale(anchor), 1, tableScale(anchor)]}
      name={anchor.id}
      position={[...anchor.position]}
      userData={{ assetId: anchor.assetId, simpleVisual: SIMPLE_MAP, presentedSeatCount: seatCount }}
      onClick={(event) => {
        event.stopPropagation()
        onInspect(anchor.id)
      }}
    >
      {anchor.picnicId ? (
        <StonePicnicTable seatCount={seatCount} />
      ) : !SIMPLE_MAP&&mainPavilion ? (
        <MainPavilionTable seatCount={seatCount} />
      ) : !SIMPLE_MAP&&anchor.pavilionId ? (
        <PavilionWoodTable seatCount={seatCount} />
      ) : (
        <>
          <Instances
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
      <DebrisGameSurface anchorId={anchor.id}>
        <OmokBoard anchor={anchor} />
        <FarkleTable anchor={anchor} />
        <OneCardBoard anchor={anchor} />
        <BridgeBoard anchor={anchor} />
        <LedgerTable anchor={anchor} />
      </DebrisGameSurface>
    </group>
  )
}
