import { useEffect, useMemo } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type BufferGeometry, type MeshLambertMaterial, type MeshStandardMaterial } from 'three'
import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import type { PropFinish, XYZ } from '../../world/art/propGeometry'

export const LIVE_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'

export interface CanvasPanel {
  context: CanvasRenderingContext2D
  texture: CanvasTexture
  /** 마지막으로 그린 내용의 키. 같으면 다시 그리지 않는다. */
  key: string
  /** 마지막으로 그린 시각(ms) */
  drawnAt: number
}

/**
 * 논리 크기(width×height)로 그리는 캔버스 텍스처. 공원 간소화 모드에서는 해상도를 낮춘다.
 * draw를 주면 한 번만 그리는 고정 간판이 된다.
 */
export function useCanvasPanel(width: number, height: number, draw?: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  simpleScale = .5) {
  const panel = useMemo<CanvasPanel>(() => {
    const scale = SIMPLE_MAP ? simpleScale : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')!
    context.scale(scale, scale)
    draw?.(context, width, height)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = SIMPLE_MAP ? 1 : 4
    return { context, texture, key: '', drawnAt: 0 }
  }, [width, height, draw, simpleScale])
  useEffect(() => () => panel.texture.dispose(), [panel])
  return panel
}

/** 조명과 밤낮에 상관없이 같은 밝기로 보이는 글자판 */
export function PanelPlane({ panel, size, position, rotation = [0, 0, 0], name, doubleSided = false }: {
  panel: CanvasPanel; size: readonly [number, number]; position: XYZ; rotation?: XYZ; name: string; doubleSided?: boolean
}) {
  return <mesh name={name} position={position} rotation={rotation}>
    <planeGeometry args={[size[0], size[1]]} />
    <meshBasicMaterial map={panel.texture} toneMapped={false} side={doubleSided ? DoubleSide : undefined}
      polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
  </mesh>
}

function FinishMaterial({ finish }: { finish: string }) {
  const side = finish === 'tile' || finish === 'stone' ? DoubleSide : undefined
  if (SIMPLE_MAP) return <meshLambertMaterial vertexColors flatShading side={side} />
  switch (finish) {
    case 'gold': return <meshStandardMaterial vertexColors metalness={.35} roughness={.42} emissive="#4a2f08" emissiveIntensity={.35} />
    case 'metal': return <meshStandardMaterial vertexColors metalness={.6} roughness={.45} />
    case 'paint': return <meshStandardMaterial vertexColors roughness={.5} metalness={.04} />
    case 'wood': return <meshStandardMaterial vertexColors roughness={.78} />
    default: return <meshStandardMaterial vertexColors roughness={.9} side={side} />
  }
}

/** 재질별로 합친 고정 모형. 공원 간소화 모드면 공원과 같은 램버트 재질을 쓴다. */
export function StaticArt({ art, name, shadow = !SIMPLE_MAP }: {
  art: Partial<Record<PropFinish, BufferGeometry>>; name: string; shadow?: boolean
}) {
  return <group name={name}>
    {Object.entries(art).map(([finish, geometry]) => <mesh key={finish} geometry={geometry} dispose={null}
      castShadow={shadow} receiveShadow={shadow}>
      <FinishMaterial finish={finish} />
    </mesh>)}
  </group>
}

export type EmissiveMaterial = MeshStandardMaterial | MeshLambertMaterial

/** 밝기를 프레임마다 바꾸는 등롱·금색 테두리 */
export function GlowArt({ art, name, color, onMaterial, finish = 'glow' }: {
  art: Partial<Record<PropFinish, BufferGeometry>>; name: string; color: string
  onMaterial: (material: EmissiveMaterial | null) => void; finish?: PropFinish
}) {
  const geometry = art[finish]
  if (!geometry) return null
  const gold = finish === 'gold'
  return <mesh name={name} geometry={geometry} dispose={null}>
    {SIMPLE_MAP ? <meshLambertMaterial ref={onMaterial} vertexColors flatShading={gold} emissive={color} emissiveIntensity={1} />
      : <meshStandardMaterial ref={onMaterial} vertexColors emissive={color} emissiveIntensity={1}
        metalness={gold ? .35 : 0} roughness={.4} toneMapped={gold} />}
  </mesh>
}

/** 가장자리만 빛나는 원형 띠(halo), 가운데가 밝은 원판(disc), 전구 빛번짐(spark, 흰색이라 색은 인스턴스가 정함) */
export function glowTexture(kind: 'halo' | 'disc' | 'spark') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const c = canvas.getContext('2d')!
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
  const color = '255, 208, 110'
  if (kind === 'spark') {
    g.addColorStop(0, 'rgba(255, 255, 255, 1)')
    g.addColorStop(.18, 'rgba(255, 255, 255, .7)')
    g.addColorStop(.45, 'rgba(255, 255, 255, .18)')
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  } else if (kind === 'halo') {
    g.addColorStop(0, `rgba(${color}, 0)`)
    g.addColorStop(.5, `rgba(${color}, 0)`)
    g.addColorStop(.68, `rgba(${color}, .9)`)
    g.addColorStop(1, `rgba(${color}, 0)`)
  } else {
    g.addColorStop(0, `rgba(${color}, .85)`)
    g.addColorStop(.55, `rgba(${color}, .35)`)
    g.addColorStop(1, `rgba(${color}, 0)`)
  }
  c.fillStyle = g
  c.fillRect(0, 0, 128, 128)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + radius, y)
  c.arcTo(x + w, y, x + w, y + h, radius)
  c.arcTo(x + w, y + h, x, y + h, radius)
  c.arcTo(x, y + h, x, y, radius)
  c.arcTo(x, y, x + w, y, radius)
  c.closePath()
}

/** 긴 닉네임은 글자를 줄여 한 줄에 맞춘다. 너무 길면 maxWidth로 가로만 좁힌다. */
export function fitFont(c: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, weight = 800) {
  c.font = `${weight} ${size}px ${LIVE_FONT}`
  const width = c.measureText(text).width
  if (width <= maxWidth) return size
  const fitted = Math.max(size * .5, size * maxWidth / width)
  c.font = `${weight} ${fitted}px ${LIVE_FONT}`
  return fitted
}

/**
 * 좁은 칸에 닉네임 맞추기. 한 줄로 72% 이상 크기를 지킬 수 없는 긴 닉네임은 두 줄로 나눈다.
 * 반환한 크기로 c.font가 설정된 상태다.
 */
export function fitLines(c: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, weight = 800) {
  c.font = `${weight} ${size}px ${LIVE_FONT}`
  const width = c.measureText(text).width
  const chars = [...text]
  if (width <= maxWidth || size * maxWidth / width >= size * .72 || chars.length < 7)
    return { lines: [text], size: fitFont(c, text, size, maxWidth, weight) }
  const mid = Math.ceil(chars.length / 2)
  const lines = [chars.slice(0, mid).join(''), chars.slice(mid).join('')]
  let fitted = size * .62
  c.font = `${weight} ${fitted}px ${LIVE_FONT}`
  const widest = Math.max(...lines.map(line => c.measureText(line).width))
  if (widest > maxWidth) {
    fitted *= maxWidth / widest
    c.font = `${weight} ${fitted}px ${LIVE_FONT}`
  }
  return { lines, size: fitted }
}

/** 월계수 가지. flip이면 좌우를 뒤집는다. */
export function laurel(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, flip = false) {
  c.save()
  c.translate(x, y)
  if (flip) c.scale(-1, 1)
  c.strokeStyle = color
  c.fillStyle = color
  c.lineWidth = size * .06
  c.beginPath()
  c.arc(size * .9, 0, size * .9, Math.PI * .72, Math.PI * 1.28)
  c.stroke()
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (.76 + i * .12)
    const px = size * .9 + Math.cos(a) * size * .9, py = Math.sin(a) * size * .9
    c.save()
    c.translate(px, py)
    c.rotate(a + Math.PI * .35)
    c.beginPath()
    c.ellipse(0, -size * .1, size * .07, size * .16, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
  c.restore()
}
