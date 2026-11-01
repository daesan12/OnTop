import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, CircleGeometry, CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { createPieceGeometry } from './pieceGeometry'
import type { Piece } from './replay'

function woodCanvas(size: number, face: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const base = ctx.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, face ? '#fae6bb' : '#be884a')
  base.addColorStop(.45, face ? '#ebc98d' : '#dfaf6a')
  base.addColorStop(1, face ? '#f4d9a8' : '#a26935')
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size)
  // 고정 수식의 나무결: 새 프레임/재접속에서 무작위 무늬가 바뀌지 않는다.
  for (let i = 0; i < 100; i++) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(100,57,22,${face ? .035 : .09})`; ctx.lineWidth = i % 4 === 0 ? 2 : .7
    for (let x = 0; x <= size; x += 8) {
      const y = i * size / 100 + Math.sin(x / 90 + i * .43) * 6 + Math.sin(x / 37 + i) * 1.2
      if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return { canvas, ctx }
}

function texture(canvas: HTMLCanvasElement) {
  const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; result.anisotropy = 4
  return result
}

function faceTexture(type: string, owner: number) {
  const { canvas, ctx } = woodCanvas(512, true)
  const ink = owner === 0 ? '#a22320' : '#145b43'
  ctx.translate(256, 256)
  ctx.strokeStyle = '#835121'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(0, 0, 245, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = ink; ctx.lineWidth = 13
  ctx.beginPath(); ctx.arc(0, 0, 224, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 204, 0, Math.PI * 2); ctx.stroke()
  // 작은 장식보다 가독성을 우선해 큰 한자와 짙은 홍청 색을 쓴다.
  ctx.font = 'bold 306px "KaiTi", "STKaiti", "SimSun", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff0cd'; ctx.fillText(type, 1, 14)
  ctx.shadowColor = '#5e2c1460'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 2
  ctx.fillStyle = ink; ctx.fillText(type, 0, 10)
  return texture(canvas)
}


function createAppearance() {
  const wood = texture(woodCanvas(256, false).canvas)
  const body = createPieceGeometry(1), face = new CircleGeometry(.88, 8)
  const band = new CylinderGeometry(.965, .93, .018, 8)
  const bodyMaterial = new MeshStandardMaterial({ map: wood, roughness: .43, metalness: 0, flatShading: true })
  const bandMaterial = new MeshStandardMaterial({ color: '#80502d', roughness: .6 })
  const labels = new Map<string, MeshBasicMaterial>()
  return { body, face, band, bodyMaterial, bandMaterial,
    label(type: string, owner: number) {
      const key = owner + ':' + type
      let material = labels.get(key)
      if (!material) { material = new MeshBasicMaterial({ map: faceTexture(type, owner), toneMapped: false }); labels.set(key, material) }
      return material
    },
    dispose() {
      body.dispose(); face.dispose(); band.dispose(); bodyMaterial.dispose(); bandMaterial.dispose(); wood.dispose()
      labels.forEach(m => { m.map?.dispose(); m.dispose() }); labels.clear()
    },
  }
}
const Appearance = createContext<ReturnType<typeof createAppearance> | null>(null)

/** 한 보드가 공용 형상·목재1장·한자별 텍스처를 소유하며 보드 제거 시 정리한다. */
export function PieceAppearanceProvider({ children }: { children: ReactNode }) {
  const appearance = useMemo(createAppearance, [])
  useEffect(() => () => appearance.dispose(), [appearance])
  return <Appearance.Provider value={appearance}>{children}</Appearance.Provider>
}

/** 위치·반경·pointer 처리는 상위 보드가 소유한다. 형상/재질만 공유한다. */
export function AlkkagiPiece({ piece, onPointerDown }: { piece: Piece; onPointerDown(event: ThreeEvent<PointerEvent>): void }) {
  const appearance = useContext(Appearance)
  if (!appearance) throw new Error('알 외형 제공자가 필요합니다.')
  return <group dispose={null} onPointerDown={onPointerDown} scale={[piece.radius, 1, piece.radius]}>
    <mesh geometry={appearance.body} material={appearance.bodyMaterial} castShadow receiveShadow />
    <mesh position={[0, .271, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={appearance.face} material={appearance.label(piece.type, piece.owner)} />
    <mesh position={[0, .035, 0]} geometry={appearance.band} material={appearance.bandMaterial} raycast={() => {}} />
  </group>
}
