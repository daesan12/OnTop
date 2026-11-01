import { useEffect, useMemo } from 'react'
import { NOTES_BOX } from '../../config/notes'
import { useNotesState } from '../../features/notes/state'
import { useSession } from '../../network/worldClient'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { createMemoPaperArt, notesBoardArt, notesBoardTitle, notesInvitation } from './notesBoardGeometry'
import { createMemoAtlas, createMemoWood } from './notesBoardTextures'
import { NOTES_BOARD_LOD_DISTANCE, NOTES_BOARD_SCALE, visibleBoardNotes } from './notesBoardLayout'
import { useCanvasFont } from './useCanvasFont'
import { useNearbyNotes } from './useNearbyNotes'
import { SIMPLE_MAP } from './mapRenderProfile'

const emptyNotes: never[] = []
const noteFont = '500 32px "BusanDandiMyeongjo"'
export function TraditionalNotesBoard({ setback = 0 }: { setback?: number }) {
  useNearbyNotes()
  const fontsReady=useCanvasFont(noteFont),notes=useNotesState(s=>s.displayNotes)
  const owner=useNotesState(s=>s.ownerId),channel=useNotesState(s=>s.channelId)
  const session=useSession(s=>s.sessionId),room=useSession(s=>s.roomId),status=useSession(s=>s.status)
  const compatible=useSession(s=>s.mapCompatible)
  const available=status==='connected'&&compatible&&owner===session&&channel===room
  const visible=useMemo(()=>visibleBoardNotes(available?notes:emptyNotes),[available,notes])
  const count=visible.length
  const paper=useMemo(()=>visible.length?createMemoAtlas(visible):undefined,[visible,fontsReady]),wood=useMemo(()=>SIMPLE_MAP?undefined:createMemoWood(),[])
  const papers=useMemo(()=>createMemoPaperArt(count),[count])
  const woodMaps=useMemo(()=>({wood}),[wood]),paperMaps=useMemo(()=>({paint:paper}),[paper])
  useEffect(()=>()=>paper?.dispose(),[paper])
  useEffect(()=>()=>wood?.dispose(),[wood])
  useEffect(()=>()=>{for(const art of [papers.near,papers.far])for(const geometry of Object.values(art))geometry.dispose()},[papers])
  return <group name="tower-notes-mailbox" position={[NOTES_BOX.x,NOTES_BOX.y,NOTES_BOX.z-setback]} scale={NOTES_BOARD_SCALE}>
    <CraftedPropLod name="observatory-notes-board" near={notesBoardArt.near} far={notesBoardArt.far} distance={NOTES_BOARD_LOD_DISTANCE} heritage surfaceMaps={woodMaps}/>
    {count>0&&<group name="observatory-user-notes" userData={{noteIds:visible.map(n=>n.id)}}>
      <CraftedPropLod name="observatory-user-notes-papers" near={papers.near} far={papers.far} distance={NOTES_BOARD_LOD_DISTANCE} heritage surfaceMaps={paperMaps}/>
    </group>}
    <PropSign width={.61} height={.125} position={[0,1.344,.252]} draw={notesBoardTitle} transparent font={noteFont}/>
    <PropSign width={.185} height={.175} position={[-.493,.550,.310]} draw={notesInvitation} transparent font={noteFont}/>
  </group>
}
