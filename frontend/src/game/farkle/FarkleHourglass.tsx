import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { CanvasTexture, Object3D, SRGBColorSpace, TextureLoader, type Group, type InstancedMesh, type Mesh } from 'three'
import type { DiceGame } from '../protocol'
import { BeveledBox } from '../../world/art/BeveledBox'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { AgedBrassMaterial, craftGrain, craftMapUrls, WalnutMaterial } from './art/CraftMaterials'
import { brassFrame, craftGeometry } from './art/CraftGeometry'
import { farkleArt } from './art/FarkleProps'
import { useReducedMotion } from '../onecard/useReducedMotion'
import { HOURGLASS_FLIP_MS, hourglassAngle, hourglassMotion, sandRemaining, type HourglassMotion } from './hourglassMotion'

const GOLD = '#d3ad62', WOOD = '#543624', JADE = '#203d33', INK = '#f7e8bd'
type Line = { text: string; size?: number; color?: string; serif?: boolean }
const noRaycast = () => {}
function ContactPatch({ x, z, width, depth, y = 1.066 }: { x: number; z: number; width: number; depth: number; y?: number }) {
  const art = farkleArt()
  return <mesh position={[x, y, z]} scale={[width / .25, 1, depth / .25]} geometry={art.contactPlane}
    material={art.contact} raycast={noRaycast} dispose={null} />
}

/** Lettering is painted onto a real, depth-tested surface, never a DOM billboard.
 * Keep one canvas/texture per label and repaint only when its content changes. */
const Lettering = memo(function Lettering({ width, height, lines, background = JADE, realistic = false }: {
  width: number; height: number; lines: Line[]; background?: string; realistic?: boolean
}) {
  const content = JSON.stringify(lines)
  const photos = useLoader(TextureLoader, craftMapUrls)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = Math.max(128, Math.round(1024 * height / width))
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace; map.anisotropy = 8
    return map
  }, [width, height])
  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height, rows: Line[] = JSON.parse(content)
    ctx.fillStyle = background; ctx.fillRect(0, 0, w, h)
    if (realistic) {
      const surface = background === WOOD ? photos[0]!.image : craftGrain().felt.image
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .48
      ctx.drawImage(surface, 0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
      const edge = ctx.createRadialGradient(w / 2, h / 2, h * .08, w / 2, h / 2, w * .6)
      edge.addColorStop(0, '#0000'); edge.addColorStop(1, '#100b073b'); ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#bca169'; ctx.lineWidth = 1.5; ctx.strokeRect(20, 20, w - 40, h - 40)
    } else {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(14, 14, w - 28, h - 28)
      ctx.globalAlpha = .35; ctx.strokeRect(22, 22, w - 44, h - 44); ctx.globalAlpha = 1
    }
    rows.forEach((line, i) => {
      ctx.fillStyle = line.color ?? INK
      const size = (line.size ?? .23) * h
      ctx.font = `${line.serif ? '600' : '500'} ${size}px ${line.serif ? 'Georgia,' : ''} "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      if (realistic) { ctx.shadowColor = '#171006'; ctx.shadowBlur = 1; ctx.shadowOffsetY = 1.5 }
      ctx.fillText(line.text, w / 2, h * (i + .5) / rows.length, w - 64)
    })
    texture.needsUpdate = true
  }, [texture, content, background, photos, realistic])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[0, 0, .022]}>
    <planeGeometry args={[width, height]} />
    {realistic ? <meshStandardMaterial map={texture} bumpMap={craftGrain().felt} bumpScale={.0003} roughness={.69} metalness={.04} />
      : <meshBasicMaterial map={texture} toneMapped={false} />}
  </mesh>
})

function Plaque({ width, height, lines, background, name, realistic = false }: {
  width: number; height: number; lines: Line[]; background?: string; name?: string; realistic?: boolean
}) {
  return <group name={name}>
    <mesh scale={[width + .045, height + .045, .04]} castShadow receiveShadow>
      <BeveledBox />{realistic ? <WalnutMaterial /> : <SurfaceMaterial kind="wood" color={WOOD} meters={.3} strength={.2} />}
    </mesh>
    <Lettering width={width} height={height} lines={lines} background={background} realistic={realistic} />
    {realistic && <mesh position={[0, 0, .026]}><primitive object={brassFrame(width + .008, height + .008)} attach="geometry" dispose={null} /><AgedBrassMaterial dark /></mesh>}
    {[-1, 1].flatMap(x => [-1, 1].map(y => <mesh key={`${x}/${y}`} position={[x * width / 2, y * height / 2, .026]}>
      <sphereGeometry args={realistic ? [.007, 12, 6] : [.009, 8, 4]} />
      {realistic ? <AgedBrassMaterial /> : <meshStandardMaterial color={GOLD} metalness={.65} roughness={.4} />}
    </mesh>))}
  </group>
}

function Hourglass({ deadline, limit, seconds, game }: { deadline: string | null; limit: number; seconds: number | null; game: DiceGame }) {
  const art = craftGeometry()
  const upper = useRef<Mesh>(null), lower = useRef<Mesh>(null), stream = useRef<Mesh>(null)
  const body = useRef<Group>(null), sand = useRef<Group>(null), grains = useRef<InstancedMesh>(null)
  const motion = useRef<HourglassMotion | null>(null), particle = useMemo(() => new Object3D(), [])
  const reduced = useReducedMotion()
  useFrame(({ clock }) => {
    if (!upper.current || !lower.current || !stream.current || !body.current || !sand.current) return
    const now = performance.now(), d = game.dice
    if (d.turnUserId) motion.current = hourglassMotion(motion.current, game.gameId, d.round, d.turnUserId, now)
    const turn = motion.current
    const flipping = !!turn && turn.from !== turn.to && now - turn.at < HOURGLASS_FLIP_MS && !reduced
    body.current.rotation.z = turn ? reduced ? turn.to : hourglassAngle(turn, now) : 0
    body.current.position.y = .2 + (flipping ? Math.sin((now - turn!.at) / HOURGLASS_FLIP_MS * Math.PI) * .07 : 0)
    body.current.userData.flips = turn?.flips ?? 0
    body.current.userData.flipping = flipping
    const fraction = sandRemaining(deadline, limit, Date.now())
    sand.current.visible = !flipping
    sand.current.userData.remaining = fraction
    upper.current.scale.setScalar(Math.cbrt(fraction) || .001)
    lower.current.scale.setScalar(Math.cbrt(1 - fraction) || .001)
    stream.current.visible = fraction > 0 && fraction < 1 && !reduced
    if (grains.current) {
      grains.current.visible = fraction > 0 && fraction < 1 && !reduced
      for (let i = 0; i < 32; i++) {
        const phase = (clock.elapsedTime * 2.2 + i / 32) % 1
        particle.position.set(Math.sin(i * 8.3) * .003, .26 - .18 * phase * phase, Math.cos(i * 4.7) * .003)
        particle.updateMatrix(); grains.current.setMatrixAt(i, particle.matrix)
      }
      grains.current.instanceMatrix.needsUpdate = true
    }
  })
  return <group name="farkle-hourglass" >
    <group ref={body} name="farkle-hourglass-body" position={[0, .2, 0]}><group position={[0, -.2, 0]}>
    <mesh position={[0, .025, 0]} castShadow>
      <cylinderGeometry args={[.112, .112, .035, 48]} /><WalnutMaterial />
    </mesh>
    <mesh position={[0, .385, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[.092, .016, 12, 48]} /><WalnutMaterial />
    </mesh>
    {[.05, .36].map(y => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[.095, .005, 8, 48]} /><AgedBrassMaterial />
    </mesh>)}
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[Math.cos(i * Math.PI / 2) * .09, .045, Math.sin(i * Math.PI / 2) * .09]} castShadow>
      <primitive object={art.post} attach="geometry" dispose={null} />
      <AgedBrassMaterial />
    </mesh>)}
    <mesh><primitive object={art.glass} attach="geometry" dispose={null} />
      <meshPhysicalMaterial color="#fffef8" transmission={.88} thickness={.003} ior={1.38} roughness={.035}
        envMapIntensity={.8} clearcoat={.1} clearcoatRoughness={.08} side={2} />
    </mesh>
    </group></group>
    <group ref={sand} name="farkle-hourglass-sand">
    <mesh ref={upper} position={[0, .295, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.065, .115, 32]} /><meshStandardMaterial color="#d6b77f" bumpMap={craftGrain().paper} bumpScale={.001} roughness={1} /></mesh>
    <mesh ref={lower} position={[0, .075, 0]}><coneGeometry args={[.069, .115, 32]} /><meshStandardMaterial color="#d6b77f" bumpMap={craftGrain().paper} bumpScale={.001} roughness={1} /></mesh>
    <mesh ref={stream} position={[0, .18, 0]}><cylinderGeometry args={[.002, .002, .19, 4]} /><meshBasicMaterial color="#e8c98c" /></mesh>
    <instancedMesh ref={grains} args={[undefined, undefined, 32]} frustumCulled={false}>
      <sphereGeometry args={[.0018, 5, 4]} /><meshBasicMaterial color="#f3d79d" />
    </instancedMesh>
    </group>
    <group position={[0, .025, .15]} rotation={[-Math.PI / 2, 0, 0]}>
      <Plaque realistic width={.27} height={.105} background={seconds !== null && seconds <= 5 ? '#782e22' : WOOD}
        lines={[{ text: seconds === null ? '대기' : `${seconds}초`, size: .45 }]} />
    </group>
  </group>
}

/** A presentation-only timer added to the original game surface. */
export function FarkleHourglass({ game, side }: { game: DiceGame; side: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer) }, [])
  const d = game.dice
  const seconds = d.turnDeadline ? Math.max(0, Math.ceil((Date.parse(d.turnDeadline) - now) / 1000)) : null
  return <group position={[.94, 1.06, -.35 * side]} rotation={[0, side < 0 ? Math.PI : 0, 0]}>
    <ContactPatch x={0} z={0} y={.006} width={.36} depth={.36} />
    <Hourglass deadline={d.turnDeadline} limit={d.turnTimeLimitMs} seconds={seconds} game={game} />
  </group>
}
