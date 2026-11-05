import { memo, useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Omok } from '../protocol'
import { OMOK_HALF, OMOK_SPACING } from '../omokPresentation'
import { OMOK_BOARD_ART_SPAN } from './boardLayout'

/** Server-classified Renju points: no duplicate client rules engine. */
export const ForbiddenMarks = memo(function ForbiddenMarks({points}:{points:NonNullable<Omok['forbiddenMoves']>}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');canvas.width=canvas.height=2048
    const ctx=canvas.getContext('2d')!,pixel=(v:number)=>(v/OMOK_BOARD_ART_SPAN+.5)*canvas.width
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 60px Arial, sans-serif'
    for (const point of points) {
      const x=pixel(point.x*OMOK_SPACING-OMOK_HALF),y=pixel(point.y*OMOK_SPACING-OMOK_HALF)
      ctx.beginPath();ctx.arc(x,y,46,0,Math.PI*2);ctx.fillStyle='#f1d49b';ctx.fill()
      ctx.lineWidth=7;ctx.strokeStyle='#bc1010';ctx.stroke();ctx.fillStyle='#bc1010'
      ctx.fillText(point.kind??'×',x,y+1)
    }
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.anisotropy=4;return map
  },[points])
  useEffect(()=>()=>texture.dispose(),[texture])
  return <mesh name="omok-forbidden-marks" position={[0,.048,0]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}>
    <planeGeometry args={[OMOK_BOARD_ART_SPAN,OMOK_BOARD_ART_SPAN]}/>
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false}/>
  </mesh>
})
