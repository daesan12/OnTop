import { Suspense } from 'react'
import { tableScale, type TableAnchor } from '../../park/tablePlacement'
import { ParkAlkkagiBoard } from '../../game/alkkagi/ParkAlkkagiBoard'
import { OmokBoard } from '../../game/OmokBoard'
import { FarkleTable } from '../../game/farkle/FarkleTable'
import { OneCardBoard } from '../../game/onecard/OneCardBoard'
import { BridgeBoard } from '../../game/bridge/BridgeBoard'
import { LedgerTable } from '../../game/ledger/LedgerTable'
import { RummikubSurface } from '../../game/rummikub/RummikubSurface'
import { HalliBoard } from '../../game/halligalli/HalliBoard'
import {DebrisGameSurface} from '../parkDebris/presentation'
import { ParkSecretTiles } from '../../game/davinci/ParkSecretTiles'

export default function TableBoards({ anchor, nativeFurniture }: { anchor: TableAnchor; nativeFurniture: boolean }) {
  return (
      <group position={[0, anchor.boardOffsetY ?? 0, 0]} scale={nativeFurniture ? [tableScale(anchor), 1, tableScale(anchor)] : 1}>
      <DebrisGameSurface anchorId={anchor.id}>
        <Suspense fallback={null}>
        <ParkAlkkagiBoard anchor={anchor} />
        <OmokBoard anchor={anchor} />
        <FarkleTable anchor={anchor} />
        <OneCardBoard anchor={anchor} />
        <BridgeBoard anchor={anchor} />
        <LedgerTable anchor={anchor} />
        <RummikubSurface anchor={anchor} />
        <HalliBoard anchor={anchor} />
        <ParkSecretTiles anchor={anchor} heightScale={nativeFurniture ? tableScale(anchor) : 1} />
        </Suspense>
      </DebrisGameSurface>
      </group>
  )
}
