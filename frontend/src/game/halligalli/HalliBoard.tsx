import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import {
  BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, LatheGeometry, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, RingGeometry, Shape, ShapeGeometry, SRGBColorSpace, Vector2, Vector3, type Group, type Mesh,
} from 'three'
import type { TableAnchor } from '../../config'
import { avatars, useSession } from '../../network/worldClient'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { useGame } from '../store'
import { CardBack } from './FruitCard'
import { useHalliUI } from './actions'
import { ringAllowedBell } from './controls'
import type { HalliGalli } from './protocol'
import {
  HALLI_BELL, HALLI_LAYOUT, HALLI_STAGE_MIN, HALLI_STAGE_PX, bellCentre, bellOutline, faceUpCorners, faceUpPose, flightPose, halliSeatIndices,
  halliStageElements, halliSurfaceY, issuePose, labelPoint, pileCorners, pilePose, poseCorners, quadTransform, seatFrame, stackHeight,
  useHalliStage, type Point, type Vec3,
} from './anchors'
import { flightElapsed, flightPhase, pileOffset, useHalliFlights } from './flights'

const { card, faceUp, pile } = HALLI_LAYOUT
const slab = new BoxGeometry(card.w, 1, card.h), glow = new PlaneGeometry(card.w + .05, card.h + .05).rotateX(-Math.PI / 2)
const paper = new MeshStandardMaterial({ color: '#f1ece3', roughness: .95 })
const gold = new MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .55, depthWrite: false })
const shade = new MeshBasicMaterial({ color: '#000', transparent: true, opacity: .32, depthWrite: false })
const ink = new MeshStandardMaterial({ color: '#151617', roughness: .55, metalness: .2 })
// Brushed steel lit by the park's own lights and outdoor reflection map; rough enough not to mirror the sky.
const steel = new MeshStandardMaterial({ color: '#d9dee3', roughness: .32, metalness: .78, envMapIntensity: .75 })
const bellBlack = new MeshStandardMaterial({ color: '#121314', roughness: .42, metalness: .15 })
const queuedRing = new MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false })
const { bellRadius } = HALLI_LAYOUT
const bellShadow = new CircleGeometry(bellRadius * 1.12, 40).rotateX(-Math.PI / 2)
const bellBase = new CylinderGeometry(bellRadius * .97, bellRadius, HALLI_BELL.baseHeight, 48)
const bellRim = new CylinderGeometry(HALLI_BELL.dome * 1.04, HALLI_BELL.dome * 1.04, .003, 48)
// Low hemisphere from the rim up to the apex, so the lathe faces point outward.
const bellDome = new LatheGeometry(Array.from({ length: 17 }, (_, i) => {
  const t = i / 16 * Math.PI / 2
  return new Vector2(HALLI_BELL.dome * Math.cos(t), HALLI_BELL.domeHeight * Math.sin(t))
}), 48)
const bellStem = new CylinderGeometry(.006, .007, HALLI_BELL.stem, 16)
const bellButton = new CylinderGeometry(HALLI_BELL.button * .92, HALLI_BELL.button, HALLI_BELL.buttonHeight, 24)
const bellQueued = new RingGeometry(bellRadius * 1.14, bellRadius * 1.26, 48).rotateX(-Math.PI / 2)

function rounded(w: number, h: number, r: number) {
  const s = new Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); s.closePath()
  return s
}
const { felt } = HALLI_LAYOUT
const feltPlane = new ShapeGeometry(rounded(felt.x * 2, felt.z * 2, .07), 5).rotateX(-Math.PI / 2)
const feltEdge = new ShapeGeometry(rounded(felt.x * 2 + .03, felt.z * 2 + .03, .085), 5).rotateX(-Math.PI / 2)
{
  const position = feltPlane.getAttribute('position'), uv = feltPlane.getAttribute('uv')
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / (felt.x * 2) + .5, -position.getZ(i) / (felt.z * 2) + .5)
}

/** Dark green felt with a printed ring where the bell stands. Drawn once, shared by every Halli Galli table. */
let artwork: { felt: MeshStandardMaterial; back: MeshStandardMaterial; dim: MeshStandardMaterial } | undefined
function tableArtwork() {
  if (artwork) return artwork
  const feltCanvas = document.createElement('canvas'); feltCanvas.width = 512; feltCanvas.height = Math.round(512 * felt.z / felt.x)
  const f = feltCanvas.getContext('2d')!
  f.fillStyle = '#1d5b40'; f.fillRect(0, 0, feltCanvas.width, feltCanvas.height)
  for (let i = 0; i < 2600; i++) {
    f.fillStyle = Math.random() < .5 ? '#ffffff0d' : '#0000000f'
    f.fillRect(Math.random() * feltCanvas.width, Math.random() * feltCanvas.height, 2, 2)
  }
  const px = feltCanvas.width / (felt.x * 2)
  f.strokeStyle = '#e7c26f55'; f.lineWidth = 3
  f.beginPath(); f.arc(feltCanvas.width / 2, feltCanvas.height / 2, (HALLI_LAYOUT.bellRadius + .04) * px, 0, Math.PI * 2); f.stroke()
  const feltTexture = new CanvasTexture(feltCanvas); feltTexture.colorSpace = SRGBColorSpace
  // The pile top reuses the 2D card back: rendered once off-screen, then drawn into the texture when it decodes.
  const backCanvas = document.createElement('canvas'); backCanvas.width = 200; backCanvas.height = 300
  const b = backCanvas.getContext('2d')!
  b.fillStyle = '#f5dde5'; b.fillRect(0, 0, 200, 300)
  const backTexture = new CanvasTexture(backCanvas); backTexture.colorSpace = SRGBColorSpace
  setTimeout(() => {
    const host = document.createElement('div'), root = createRoot(host)
    flushSync(() => root.render(<CardBack />))
    const svg = host.querySelector('svg')
    if (svg) {
      svg.setAttribute('width', '200'); svg.setAttribute('height', '300')
      const image = new Image()
      image.onload = () => { b.drawImage(image, 0, 0, 200, 300); backTexture.needsUpdate = true }
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    }
    root.unmount()
  })
  return artwork = {
    felt: new MeshStandardMaterial({ map: feltTexture, roughness: 1 }),
    back: new MeshStandardMaterial({ map: backTexture, roughness: .9 }),
    dim: new MeshStandardMaterial({ map: backTexture, roughness: .9, color: '#8d8d8d' }),
  }
}

/**
 * One player's face-down pile and face-up stack as real slabs; the face-up top is the projected DOM card. While cards
 * fly after a bell the slabs keep what has not left yet and lack what has not landed yet, so a pile never grows
 * before its cards arrive. The counts themselves are the server's.
 */
function Piles({ anchor, seatIndex, userId, drawCount, faceUpCount, turn, forfeited, showFaceUp }: {
  anchor: TableAnchor; seatIndex: number; userId: string; drawCount: number; faceUpCount: number; turn: boolean; forfeited: boolean
  showFaceUp: boolean
}) {
  const { out, right } = seatFrame(anchor, seatIndex), yaw = Math.atan2(out.x, out.z), surface = halliSurfaceY(anchor), art = tableArtwork()
  const at = (radial: number, lateral: number) => [out.x * radial + right.x * lateral, out.z * radial + right.z * lateral] as const
  const [px, pz] = at(pile.radial, pile.lateral), [fx, fz] = at(faceUp, 0)
  const drawPile = useRef<Mesh>(null), faceStack = useRef<Mesh>(null)
  useFrame(() => {
    const { plan } = useHalliFlights.getState(), offset = pileOffset(plan, flightElapsed(), userId)
    stack(drawPile.current, drawCount + offset.draw, surface)
    stack(faceStack.current, showFaceUp ? faceUpCount + offset.face : 0, surface)
  })
  return <group name="halligalli-seat" userData={{ seatIndex, drawCount, faceUpCount }}>
    {turn && <mesh geometry={glow} material={gold} position={[px, surface + .0006, pz]} rotation={[0, yaw, 0]} />}
    <mesh ref={drawPile} name="halligalli-draw-pile" geometry={slab} position={[px, surface, pz]} rotation={[0, yaw, 0]}
      visible={false} material={[paper, paper, forfeited ? art.dim : art.back, paper, paper, paper]} />
    {/* Only the stage draws the face-up top; without it (fixed 2D layout) the stack would show as a blank white card. */}
    <mesh ref={faceStack} name="halligalli-faceup-stack" geometry={slab} material={paper} position={[fx, surface, fz]}
      rotation={[0, yaw, 0]} visible={false} />
  </group>
}
function stack(mesh: Mesh | null, cards: number, surface: number) {
  if (!mesh) return
  const height = stackHeight(cards)
  mesh.visible = height > 0
  if (height > 0) { mesh.scale.y = height; mesh.position.y = surface + height / 2 }
}

const PRESS_MS = 150, PLUNGER_Y = HALLI_BELL.baseHeight + HALLI_BELL.domeHeight * .96
/**
 * The bell standing at the table centre. On the table stage a seated player's click rings through the same path as
 * Space and the 2D bell (ringAllowedBell); the press animation follows the ring mark, so it never delays the request.
 * Spectators, the fixed 2D layout and the preparing table get no click.
 */
function TableBell({ surface, interactive, gameId, bellWindowId }: {
  surface: number; interactive: boolean; gameId?: string; bellWindowId: number | null
}) {
  const { gl } = useThree(), plunger = useRef<Group>(null), body = useRef<Group>(null), hovering = useRef(false)
  const press = useRef(-Infinity), reduced = useRef(false)
  const mark = useHalliUI(s => gameId && bellWindowId !== null && s.gameId === gameId ? s.rings[bellWindowId] : undefined)
  const marked = useRef(mark)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'), change = () => { reduced.current = media.matches }
    change(); media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  // A new mark on the shown window means this press was accepted locally (queued or sent): play the press once.
  useEffect(() => { if (mark && !marked.current) press.current = performance.now(); marked.current = mark }, [mark])
  useEffect(() => () => { if (hovering.current && gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = '' }, [gl])
  useFrame(({ clock }) => {
    const t = reduced.current ? 1 : Math.min(1, (performance.now() - press.current) / PRESS_MS), dip = Math.sin(t * Math.PI)
    if (plunger.current) plunger.current.position.y = PLUNGER_Y - dip * .008
    if (body.current) body.current.scale.y = 1 - dip * .025
    queuedRing.opacity = mark === 'queued' ? .45 + Math.sin(clock.elapsedTime * 8) * .2 : 0
    if (hovering.current) gl.domElement.style.cursor = interactive && !mark && bellWindowId !== null ? 'pointer' : ''
  })
  const top = HALLI_BELL.baseHeight
  return <group name="halligalli-bell" position={[0, surface, 0]} userData={{ interactive, mark: mark ?? null }}
    onPointerOver={event => { if (!interactive) return; event.stopPropagation(); hovering.current = true }}
    onPointerOut={() => { hovering.current = false; if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = '' }}
    onClick={event => {
      if (!interactive) return
      event.stopPropagation()
      if (event.button === 0) ringAllowedBell()
    }}>
    <mesh geometry={bellShadow} material={shade} position={[0, .0008, 0]} />
    <mesh geometry={bellQueued} material={queuedRing} position={[0, .001, 0]} />
    <group ref={body}>
      <mesh geometry={bellBase} material={bellBlack} position={[0, top / 2, 0]} />
      <mesh geometry={bellRim} material={steel} position={[0, top + .0015, 0]} />
      <mesh geometry={bellDome} material={steel} position={[0, top, 0]} />
    </group>
    <group ref={plunger} position={[0, PLUNGER_Y, 0]}>
      <mesh geometry={bellStem} material={steel} position={[0, HALLI_BELL.stem / 2, 0]} />
      <mesh geometry={bellButton} material={steel} position={[0, HALLI_BELL.stem + HALLI_BELL.buttonHeight / 2, 0]} />
    </group>
  </group>
}

export function HalliBoard({ anchor }: { anchor: TableAnchor }) {
  const state = useGame(useShallow(s => ({ halli: s.game?.halli, role: s.game?.role, gameId: s.game?.gameId })))
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId })))
  const projected = useHalliStage(s => s.projected)
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!state.halli && !!binding && (state.role === 'PLAYER' ? session.tableId : session.watchedTableId) === binding.tableId
  const selected = useTableGameCode(anchor.id) === 'HALLI_GALLI'
  if (!relevant && !selected) return null
  const h = relevant ? state.halli! : null, surface = halliSurfaceY(anchor), main = anchor.pavilionId === 'P0'
  const seats = h ? halliSeatIndices(h.players.map(p => p.userId), id => avatars.get(id)?.seatIndex) : []
  return <group name="halligalli-table" dispose={null}>
    <group name="halligalli-felt-mat">
      {!main && <mesh geometry={feltEdge} material={ink} position={[0, surface - .0035, 0]} />}
      <mesh geometry={feltPlane} material={tableArtwork().felt} position={[0, surface - .002, 0]} />
    </group>
    <TableBell surface={surface} interactive={!!h && projected && state.role === 'PLAYER'} gameId={h ? state.gameId : undefined}
      bellWindowId={h?.bellWindowId ?? null} />
    {h && h.players.map((p, i) => <Piles key={p.userId} anchor={anchor} seatIndex={seats[i]!} userId={p.userId} drawCount={p.drawCount}
      faceUpCount={p.faceUpCount} turn={h.status === 'PLAYING' && h.turnUserId === p.userId} forfeited={p.forfeited} showFaceUp={projected} />)}
    {h && <StageProjector anchor={anchor} halli={h} />}
  </group>
}

const STAGE_SETTLE_MS = 200
/** The park marks its first presented frame; before that the canvas is empty and projected cards would float. */
let scenePresented = false
const presented = () => scenePresented ||= performance.getEntriesByName('park-scene-presented').length > 0
/**
 * Projects the DOM stage onto this table with the camera that is actually rendering, after the camera rig has moved
 * it (priority 1). Writes only transforms that changed; React does not re-render per frame.
 */
function StageProjector({ anchor, halli }: { anchor: TableAnchor; halli: HalliGalli }) {
  const latest = useRef(halli); latest.current = halli
  const point = useMemo(() => new Vector3(), [])
  const written = useRef(new Map<HTMLElement, string>()), settle = useRef({ value: false, since: 0 })
  useEffect(() => () => {
    useHalliStage.setState({ projected: false })
    for (const element of halliStageElements.values()) { element.style.transform = ''; element.style.visibility = '' }
  }, [])
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    const project = (p: Vec3): Point & { front: boolean } => {
      point.set(p[0], p[1], p[2]).project(camera)
      return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, front: point.z > -1 && point.z < 1 }
    }
    const h = latest.current, seats = halliSeatIndices(h.players.map(p => p.userId), id => avatars.get(id)?.seatIndex)
    const centre = project(bellCentre(anchor))
    const faces = h.players.map((p, i) => faceUpCorners(anchor, seats[i]!, p.faceUpCount).map(project))
    const valid = presented() && size.width >= HALLI_STAGE_MIN.width && size.height >= HALLI_STAGE_MIN.height && centre.front
      && centre.x > 0 && centre.x < size.width && centre.y > 0 && centre.y < size.height && faces.every(q => q.every(c => c.front))
    const now = performance.now()
    if (valid !== settle.current.value) { settle.current = { value: valid, since: now } }
    if (useHalliStage.getState().projected !== valid && (now - settle.current.since >= STAGE_SETTLE_MS || !valid && !centre.front)) {
      useHalliStage.setState({ projected: valid })
    }
    if (!useHalliStage.getState().projected) return
    const place = (key: string, transform: string) => {
      const element = halliStageElements.get(key)
      if (!element) return
      if (written.current.get(element) !== transform) { element.style.transform = transform; written.current.set(element, transform) }
      if (element.style.visibility !== 'visible') element.style.visibility = 'visible'
    }
    const quad = (key: string, corners: (Point & { front: boolean })[], w: number, hgt: number) =>
      place(key, quadTransform(w, hgt, corners.map(c => ({ x: +c.x.toFixed(1), y: +c.y.toFixed(1) }))))
    // The accessible bell button covers the 3D bell's screen box; the mouse passes through it to the 3D bell.
    const outline = bellOutline(anchor).map(project), xs = outline.map(o => o.x), ys = outline.map(o => o.y)
    const left = Math.min(...xs), top = Math.min(...ys), bell = halliStageElements.get('bell')
    if (bell) {
      const width = `${Math.round(Math.max(...xs) - left)}px`, height = `${Math.round(Math.max(...ys) - top)}px`
      if (bell.style.width !== width) bell.style.width = width
      if (bell.style.height !== height) bell.style.height = height
    }
    place('bell', `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`)
    const piles = h.players.map((p, i) => pileCorners(anchor, seats[i]!, p.drawCount).map(project))
    // Screen boxes of every card on the felt; a seat label must not cover any of them.
    const cards = [...faces, ...piles].map(q => {
      const xs = q.map(c => c.x), ys = q.map(c => c.y)
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
    })
    // The viewer's own label (data-own, set by HalliStage from the panel's viewerId) is the status bar docked at the
    // bottom centre by CSS; only the other seats hang here. Reading the same attribute keeps both sides in step.
    h.players.forEach((p, i) => {
      quad(`face:${p.userId}`, faces[i]!, HALLI_STAGE_PX.card.w, HALLI_STAGE_PX.card.h)
      quad(`draw:${p.userId}`, piles[i]!, HALLI_STAGE_PX.card.w, HALLI_STAGE_PX.card.h)
      const label = halliStageElements.get(`label:${p.userId}`), at = project(labelPoint(anchor, seats[i]!))
      if (!label) return
      if (label.dataset.own !== undefined) {
        // A seat that just became the viewer's (session or role change) drops its projected place for the CSS dock.
        if (written.current.has(label)) { label.style.transform = ''; written.current.delete(label) }
        return
      }
      // Hang the label off the felt edge, away from the bell, and keep it whole inside the screen.
      const dx = at.x - centre.x, dy = at.y - centre.y, length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length
      const w = label.offsetWidth, hgt = label.offsetHeight
      let x = at.x + ux * w / 2 - w / 2, y = at.y + uy * hgt / 2 - hgt / 2
      // Low spectator views bring the felt edge close to the cards: step further out until no card is covered.
      for (let step = 0; step < 16 && cards.some(c => x < c.right + 4 && x + w > c.left - 4 && y < c.bottom + 4 && y + hgt > c.top - 4); step++) {
        x += ux * 4; y += uy * 4
      }
      x = Math.max(8, Math.min(size.width - w - 8, x)); y = Math.max(8, Math.min(size.height - hgt - 8, y))
      place(`label:${p.userId}`, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`)
    })
    // Cards moving after a bell glide over the felt along a low arc, through the same projection as the cards at rest.
    const { plan } = useHalliFlights.getState()
    if (!plan) return
    const elapsed = flightElapsed(), seatOf = (userId: string) => seats[h.players.findIndex(p => p.userId === userId)] ?? 0
    plan.flights.forEach((f, i) => {
      const element = halliStageElements.get(`flight:${i}`), phase = flightPhase(f, elapsed)
      if (!element) return
      if (!phase) { if (element.style.visibility !== 'hidden') element.style.visibility = 'hidden'; return }
      const to = pilePose(anchor, seatOf(f.to.userId), f.to.count)
      const from = f.from.pile === 'bell' ? { ...issuePose(anchor, seatOf(f.to.userId)), scale: .5 + .5 * phase.appear }
        : f.from.pile === 'face' ? faceUpPose(anchor, seatOf(f.from.userId), f.from.count) : pilePose(anchor, seatOf(f.from.userId), f.from.count)
      // Lower cards of a collected stack start just under the top one.
      const pose = flightPose({ ...from, lift: Math.max(.001, from.lift - f.layer * HALLI_LAYOUT.thickness * 2) }, to, phase.t)
      quad(`flight:${i}`, poseCorners(anchor, pose).map(project), HALLI_STAGE_PX.card.w, HALLI_STAGE_PX.card.h)
      element.style.opacity = String(phase.appear)
    })
  }, 1)
  return null
}
