import type { TableAnchor } from '../../park/tablePlacement'
import TableBoards from './TableBoards'
import { TableFurniture } from './TableFurniture'

export function TableShell({ anchor, onInspect, nativeFurniture = false }: {
  anchor: TableAnchor; onInspect?: (id: string) => void; nativeFurniture?: boolean
}) {
  return <TableFurniture anchor={anchor} onInspect={onInspect} nativeFurniture={nativeFurniture}>
    <TableBoards anchor={anchor} nativeFurniture={nativeFurniture} />
  </TableFurniture>
}
