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
export function TraditionalNotesBoard({ showFeedStatus = false }: { showFeedStatus?: boolean } = {}) {
  useNearbyNotes()
  const fontsReady=useCanvasFont(noteFont),notes=useNotesState(s=>s.displayNotes)
  const owner=useNotesState(s=>s.ownerId),channel=useNotesState(s=>s.channelId)
  const session=useSession(s=>s.sessionId),room=useSession(s=>s.roomId),status=useSession(s=>s.status)
  const compatible=useSession(s=>s.mapCompatible)
  const available=status==='connected'&&compatible&&owner===session&&channel===room
  const loaded=useNotesState(s=>showFeedStatus&&s.loaded)
  const loading=useNotesState(s=>showFeedStatus&&s.loading)
  const readError=useNotesState(s=>showFeedStatus&&!!s.readError)
  const statusText = available && loading ? '메모를 불러오는 중'
    : available && readError ? '메모를 불러오지 못했어요'
    : available && loaded ? '아직 붙은 메모가 없어요'
    : '가까이에서 메모를 읽을 수 있어요'
  const drawStatus=useMemo(()=>(c: CanvasRenderingContext2D,w:number,h:number)=>{
    c.fillStyle='#f4ead3';c.fillRect(0,0,w,h)
    c.fillStyle='#365144';c.font=`700 ${h*.42}px "Malgun Gothic",sans-serif`
    c.textAlign='center';c.textBaseline='middle';c.fillText(statusText,w/2,h/2,w*.92)
  },[statusText])
  const visible=useMemo(()=>visibleBoardNotes(available?notes:emptyNotes),[available,notes])
  const count=visible.length
  const paper=useMemo(()=>visible.length?createMemoAtlas(visible):undefined,[visible,fontsReady]),wood=useMemo(()=>SIMPLE_MAP?undefined:createMemoWood(),[])
  const papers=useMemo(()=>createMemoPaperArt(count),[count])
  const woodMaps=useMemo(()=>({wood}),[wood]),paperMaps=useMemo(()=>({paint:paper}),[paper])
  useEffect(()=>()=>paper?.dispose(),[paper])
  useEffect(()=>()=>wood?.dispose(),[wood])
  useEffect(()=>()=>{for(const art of [papers.near,papers.far])for(const geometry of Object.values(art))geometry.dispose()},[papers])
  return <group name="tower-notes-mailbox" position={[NOTES_BOX.x,NOTES_BOX.y,NOTES_BOX.z]} scale={NOTES_BOARD_SCALE}>
    <CraftedPropLod name="observatory-notes-board" near={notesBoardArt.near} far={notesBoardArt.far} distance={NOTES_BOARD_LOD_DISTANCE} heritage surfaceMaps={woodMaps}/>
    {count>0&&<group name="observatory-user-notes" userData={{noteIds:visible.map(n=>n.id)}}>
      <CraftedPropLod name="observatory-user-notes-papers" near={papers.near} far={papers.far} distance={NOTES_BOARD_LOD_DISTANCE} heritage surfaceMaps={paperMaps}/>
    </group>}
    {showFeedStatus&&count===0&&<group name="observatory-notes-status">
      <PropSign width={.85} height={.135} position={[0,.95,.15]} draw={drawStatus} font={noteFont}/>
    </group>}
    <PropSign width={.61} height={.125} position={[0,1.344,.252]} draw={notesBoardTitle} transparent font={noteFont}/>
    <PropSign width={.185} height={.175} position={[-.493,.550,.310]} draw={notesInvitation} transparent font={noteFont}/>
  </group>
}
