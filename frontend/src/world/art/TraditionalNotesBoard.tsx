import { useEffect, useMemo, useState } from 'react'
import { NOTES_BOX } from '../../config/notes'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { notesBoardArt, notesBoardTitle, notesInvitation } from './notesBoardGeometry'
import { createMemoAtlas, createMemoWood } from './notesBoardTextures'

export function TraditionalNotesBoard() {
  const [fontsReady,setFontsReady]=useState(false)
  useEffect(()=>{
    let active=true
    void document.fonts.load('500 28px "BusanDandiMyeongjo"').then(()=>{if(active)setFontsReady(true)}).catch(()=>{})
    return ()=>{active=false}
  },[])
  const paper=useMemo(createMemoAtlas,[fontsReady]),wood=useMemo(createMemoWood,[])
  const surfaceMaps=useMemo(()=>({paint:paper,wood}),[paper,wood])
  useEffect(()=>()=>paper.dispose(),[paper])
  useEffect(()=>()=>wood.dispose(),[wood])
  return <group name="tower-notes-mailbox" position={[NOTES_BOX.x,NOTES_BOX.y,NOTES_BOX.z]}>
    <CraftedPropLod name="observatory-notes-board" near={notesBoardArt.near} far={notesBoardArt.far} distance={16} heritage surfaceMaps={surfaceMaps}/>
    <PropSign key={'title-'+fontsReady} width={.61} height={.125} position={[0,1.344,.247]} draw={notesBoardTitle} transparent/>
    <PropSign key={'invitation-'+fontsReady} width={.185} height={.175} position={[-.493,.550,.305]} draw={notesInvitation} transparent/>
  </group>
}
