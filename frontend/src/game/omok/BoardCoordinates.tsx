import { memo, useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { OMOK_HALF, OMOK_SIZE, OMOK_SPACING } from '../omokPresentation'

/** A1은 좌상단, 열은 오른쪽·행은 아래쪽으로 읽는 두 면 좌표. */
export const BoardCoordinates = memo(function BoardCoordinates() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2048
    const ctx = canvas.getContext('2d')!
    const pixel = (value: number) => (value / 1.5 + .5) * canvas.width
    ctx.fillStyle = '#fff0cd'
    ctx.strokeStyle = '#372215'
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.font = '700 46px Georgia, serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const label = (text: string, x: number, y: number) => {
      ctx.save(); ctx.translate(pixel(x), pixel(y))
      ctx.strokeText(text, 0, 0); ctx.fillText(text, 0, 0); ctx.restore()
    }
    for (let index = 0; index < OMOK_SIZE; index++) {
      const p = index * OMOK_SPACING - OMOK_HALF
      label(String.fromCharCode(65 + index), p, -.725)
      label(String(index + 1), -.725, p)
    }
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4
    return map
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh name="omok-board-coordinates" position={[0, .043, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
    <planeGeometry args={[1.5, 1.5]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </mesh>
})
