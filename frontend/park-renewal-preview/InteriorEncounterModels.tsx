import type { ReactNode } from 'react'
import { CircleGeometry, Euler, PlaneGeometry, Quaternion, Shape as Outline, ShapeGeometry, SphereGeometry, Vector3, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { encounterFinishes, type Finish } from './interiorEncounterMaterials'
import {
  EYE_DIRS, MOUTH_DIR, aim, cached, facePoint, furGeometry, hairGeometry, handGeometry, headGeometry, hoodGeometry,
  limbGeometry, lumpGeometry, tatteredGeometry, teethGeometry, type FaceKind, type HandStyle, type V,
} from './encounterSculpt'
import { footprintTexture, irisTexture, sackTexture, scleraTexture, shadowTexture } from './encounterTextures'

// The twelve underground encounters (InteriorEncounters animates them by these group names; keep them).
// S15P31B105-450: sculpted faces, bony long-fingered hands, hanging hair, torn cloth, teeth, fur and bloodshot eyes
// replace the earlier rounded blocks. Pale skin carries a faint emissive so a face reads in the dark from the
// third-person camera; eyes that glow use unlit materials.

type Vec = [number, number, number]
const up = new Vector3(0,1,0)
const rounded = new RoundedBoxGeometry(1,1,1,2,.10)
const oval = new SphereGeometry(.5,24,14)

function Surface({ color, finish = 'stone', glow, vertexColors = false }: { color: string; finish?: Finish; glow?: number; vertexColors?: boolean }) {
  const { texture, roughness, metalness, bumpScale } = encounterFinishes[finish]
  return <meshStandardMaterial color={color} vertexColors={vertexColors} map={texture} bumpMap={texture} bumpScale={bumpScale} roughness={roughness}
    metalness={metalness} emissive={glow ? color : '#000000'} emissiveIntensity={glow ?? 0} />
}
function Glow({ color }: { color: string }) { return <meshBasicMaterial color={color} toneMapped={false} /> }

export function Shape({ at, size, color, sphere = false, rotation, finish }: {
  at: Vec; size: Vec; color: string; sphere?: boolean; rotation?: Vec; finish?: Finish
}) {
  return <mesh position={at} scale={size} rotation={rotation} geometry={sphere ? oval : rounded} dispose={null}>
    <Surface color={color} finish={finish} />
  </mesh>
}

function Rod({ from, to, width, color, finish }: { from: Vec; to: Vec; width: number; color: string; finish?: Finish }) {
  const [x, y, z] = from
  const dx = to[0] - x, dy = to[1] - y, dz = to[2] - z
  const length = Math.hypot(dx, dy, dz)
  const direction = new Vector3(dx,dy,dz).normalize()
  return <group position={[x + dx/2, y + dy/2, z + dz/2]}
    quaternion={new Quaternion().setFromUnitVectors(up,direction)}>
    <mesh>
      <cylinderGeometry args={[width * .72, width, length, 10]} />
      <Surface color={color} finish={finish} />
    </mesh>
  </group>
}

function Geo({ geometry, color, finish = 'skin', glow, at, rotation, scale }: {
  geometry: BufferGeometry; color: string; finish?: Finish; glow?: number; at?: V; rotation?: V; scale?: V | number
}) {
  return <mesh geometry={geometry} position={at as Vec} rotation={rotation as Vec} scale={scale as Vec} dispose={null}>
    <Surface color={color} finish={finish} glow={glow} vertexColors={!!geometry.getAttribute('color')} />
  </mesh>
}
const Limb = ({ id, points, radii, color, finish = 'skin', glow }: { id: string; points: V[]; radii: number[]; color: string; finish?: Finish; glow?: number }) =>
  <Geo geometry={limbGeometry(id, points, radii)} color={color} finish={finish} glow={glow} />
const Cloth = ({ id, color, height, radius, at = [0, 0, 0], tear = .22, flip = false, finish = 'cloth' }: {
  id: string; color: string; height: number; radius: number; at?: V; tear?: number; flip?: boolean; finish?: Finish
}) => <Geo geometry={tatteredGeometry(id, tear)} color={color} finish={finish} at={[at[0], at[1] + height / 2, at[2]]}
  rotation={flip ? [Math.PI, 0, 0] : undefined} scale={[radius, height, radius]} />
function Hand({ id, at, dir, roll = 0, style, color, glow = .08 }: { id: string; at: V; dir: V; roll?: number; style: HandStyle; color: string; glow?: number }) {
  return <mesh geometry={handGeometry(id, style)} position={at as Vec} quaternion={aim(dir, roll)} dispose={null}>
    <Surface color={color} finish="skin" glow={glow} />
  </mesh>
}

type Eyes = 'stare' | 'void' | 'glow' | 'milky'
/** A gaunt head (face +z) with eyes in deep sockets, an optional open mouth with teeth, and hanging hair. */
function Head({ at, rot = [0, 0, 0], kind, skin, finish = 'skin', eyes, glow = .05, hair, gravity = [0, -1, 0], scale = 1 }: {
  at: V; rot?: V; kind: FaceKind; skin: string; finish?: Finish; eyes: Eyes; glow?: number; scale?: number
  hair?: { id: string; length: number; veil?: boolean; color?: string }; gravity?: V
}) {
  const fall = new Vector3(...gravity).applyQuaternion(new Quaternion().setFromEuler(new Euler(...rot)).invert())
  const mouth = facePoint(MOUTH_DIR, kind, -.018)
  return <group position={at as Vec} rotation={rot as Vec} scale={scale}>
    <Geo geometry={headGeometry(kind)} color={skin} finish={finish} glow={glow} />
    {EYE_DIRS.map((d, i) => {
      const p = facePoint(d, kind, -.016)
      return <group key={i} position={p as Vec}>
        {eyes === 'stare' && <>
          <mesh scale={[1, .9, .8]}><sphereGeometry args={[.03, 16, 12]} /><meshStandardMaterial map={scleraTexture()} roughness={.15} emissive="#fff4e0" emissiveIntensity={.32} /></mesh>
          <mesh position={[0, 0, .0245]} scale={[1, 1, .4]}><sphereGeometry args={[.0062, 8, 6]} /><Glow color="#020202" /></mesh>
          <mesh position={[-.006, .006, .027]}><sphereGeometry args={[.0025, 6, 4]} /><Glow color="#fffaf0" /></mesh>
        </>}
        {eyes === 'milky' && <mesh scale={[1, .85, .75]}><sphereGeometry args={[.03, 16, 12]} /><meshStandardMaterial color="#d9dccf" roughness={.25} emissive="#b8c2b4" emissiveIntensity={.18} /></mesh>}
        {(eyes === 'void' || eyes === 'glow') && <mesh scale={[1.3, 1.05, .7]}><sphereGeometry args={[.036, 12, 8]} /><Glow color="#000000" /></mesh>}
        {eyes === 'glow' && <mesh position={[0, 0, .012]}><sphereGeometry args={[.009, 8, 6]} /><Glow color="#ffcf8a" /></mesh>}
      </group>
    })}
    {kind.mouth !== 'shut' && <>
      <mesh position={mouth as Vec} scale={kind.mouth === 'scream' ? [.055, .11, .03] : [.045, .06, .025]}><sphereGeometry args={[1, 14, 10]} /><Glow color="#050202" /></mesh>
      <Geo geometry={teethGeometry('head-' + kind.mouth, 7, .028, .006, [0, -1, .1], .0038)} color="#c9bd98" finish="stone"
        at={[mouth[0], mouth[1] + (kind.mouth === 'scream' ? .085 : .045), mouth[2] + .012]} />
    </>}
    {/* A dark mass under the strands so long hair reads as hair, not a cage of sticks. */}
    {hair && <Geo geometry={hairMass()} color={hair.color ?? '#0d0b0b'} finish="hair" at={[0, .03, -.04]} scale={[.205, .255, .2]} />}
    {hair && <Geo geometry={hairGeometry(`${hair.id}-${fall.toArray().map(v => v.toFixed(2)).join(',')}`, hair.length, [fall.x, fall.y, fall.z], hair.veil)}
      color={hair.color ?? '#0d0b0b'} finish="hair" />}
  </group>
}

// Shared geometry built once.
const crackGeometry = () => cached('crack', () => {
  const s = new Outline(), pts: [number, number][] = [[-.02, .42], [.06, .25], [.01, .12], [.11, 0], [.03, -.12], [.08, -.3], [-.02, -.43], [-.07, -.2], [-.13, -.05], [-.06, .1], [-.11, .26]]
  pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y))
  return new ShapeGeometry(s)
})
const footprint = () => cached('footprint', () => new PlaneGeometry(.17, .34).rotateX(-Math.PI / 2))
const shadowPlane = () => cached('shadow-plane', () => new PlaneGeometry(1.05, 1.8))
const irisDisc = () => cached('iris', () => new CircleGeometry(.5, 28))
const lidSclera = () => cached('sclera', () => new SphereGeometry(.5, 28, 18))
const sackHead = () => cached('sack', () => lumpGeometry('sack'))
const hairMass = () => cached('hair-mass', () => lumpGeometry('hair-mass', 0, 0, .6))

const stone = '#7d8174'
const straw = '#a59470'
const rust = '#725245'
const bone = '#cbbf9c'
const longFingers: HandStyle = { finger: .2, spread: .16, curl: .3, thick: .0085 }

function Basin() {
  return <>
    <group name="pool-ripples" rotation={[-Math.PI/2,0,0]} position={[0,.09,0]}>
      {[1.04,.74,.49].map((radius,i) => <mesh key={radius} position={[i*.19,-i*.08,.002*i]} scale={[1.13,.84,1]}>
        <circleGeometry args={[radius,42]} /><Surface color="#1d2b2a" finish="water" />
      </mesh>)}
      {[.39,.72,.95].map((radius, i) => <mesh key={radius} position={[0,0,.009 + .003*i]}
        rotation={[0,0,i*1.3]} scale={[1.06,.82,1]}>
        <ringGeometry args={[radius - .011,radius,42,1,.22,4.7]} />
        <meshBasicMaterial color="#67827a" transparent opacity={.39} depthWrite={false} />
      </mesh>)}
    </group>
    <group name="pool-figure">
      <Cloth id="pool" color="#b9b8ab" height={1.2} radius={.36} tear={.15} />
      <Geo geometry={lumpGeometry('shoulders')} color="#b9b8ab" finish="cloth" at={[0, 1.22, 0]} scale={[.27, .12, .17]} />
      <Limb id="pool-neck" points={[[0, 1.25, 0], [0, 1.33, .03]]} radii={[.045, .04]} color="#a3aa9f" />
      <Head at={[0, 1.42, .06]} rot={[.6, 0, 0]} kind={{ mouth: 'shut', gaunt: 1 }} skin="#a3aa9f" eyes="milky"
        hair={{ id: 'pool', length: .95, veil: true, color: '#080808' }} />
      <Limb id="pool-arm-l" points={[[-.24, 1.18, 0], [-.31, 1.08, .3], [-.22, 1.2, .58]]} radii={[.038, .032, .027]} color="#a3aa9f" />
      <Hand id="pool-l" at={[-.22, 1.2, .58]} dir={[0, .3, 1]} roll={.3} style={{ finger: .2, spread: .22, curl: .35, thick: .0085 }} color="#a3aa9f" />
      <Limb id="pool-arm-r" points={[[.24, 1.18, 0], [.36, .75, .2], [.42, .27, .34]]} radii={[.038, .032, .027]} color="#a3aa9f" />
      <Hand id="pool-r" at={[.42, .27, .34]} dir={[.1, -.8, .5]} style={{ finger: .19, spread: .25, curl: .2, thick: .0085 }} color="#a3aa9f" />
    </group>
  </>
}

function Watchers() {
  return <>
    {/* A mound of wet flesh the eyes open out of. */}
    <Geo geometry={lumpGeometry('watch-bed', 0, .02)} color="#211414" finish="flesh" at={[0, 1.26, -.32]} scale={[1.75, 1.0, .3]} />
    <group name="watcher-wall">
      {Array.from({length: 11}, (_,i) => {
        const center = i === 0
        const angle = 2*Math.PI*(i-1)/10
        const x = center ? 0 : Math.cos(angle)*1.16
        const y = center ? 1.25 : 1.25 + Math.sin(angle)*(.53 + .16*(i%2))
        const size = center ? .86 : .39 + (i%4)*.05
        return <group key={i} position={[x,y,-.09*x*x + (center ? .18 : 0)]}
          rotation={[0,-x*.17,center?0:Math.cos(i*4)*.37]} scale={size}>
          <Geo geometry={lumpGeometry('socket', 0, 0, .45)} color="#4a2724" finish="flesh" scale={[.56, .33, .13]} />
          <Shape at={[0,0,.05]} size={[.78,.36,.06]} color="#140707" sphere finish="flesh" />
          <group name="watcher-lid">
            <mesh geometry={lidSclera()} position={[0, 0, .055]} scale={[.72, .32, .16]} dispose={null}>
              <meshStandardMaterial map={scleraTexture()} roughness={.12} emissive="#ffffff" emissiveIntensity={.04} />
            </mesh>
            <group name="watcher-pupil">
              <mesh geometry={irisDisc()} position={[0,0,.137]} scale={[.24,.24,1]} dispose={null}>
                <meshStandardMaterial map={irisTexture(i % 3 ? '#8a6422' : '#5f7a2c')} roughness={.08} emissive="#ffffff" emissiveIntensity={.06} />
              </mesh>
              <mesh position={[-.04,.04,.142]}><sphereGeometry args={[.016,8,6]} /><Glow color="#fffaf0" /></mesh>
            </group>
          </group>
          <Geo geometry={lumpGeometry('lid-up', 0, 0, .4)} color="#5c302c" finish="flesh" at={[0, .14, .085]} scale={[.42, .09, .085]} />
          <Geo geometry={lumpGeometry('lid-low', 0, 0, .4)} color="#552b28" finish="flesh" at={[0, -.135, .08]} scale={[.4, .065, .07]} />
        </group>
      })}
    </group>
  </>
}

export const encounterModels: Record<number, ReactNode> = {
  // 1. A face slides out from the side, head cocked, staring with pinprick pupils; a hand creeps along its jaw.
  1: <>
    <Head at={[0, 1.5, 0]} rot={[.05, .3, -.42]} kind={{ mouth: 'gape', gaunt: 1.2 }} skin="#b9b5a3" eyes="stare" glow={.06}
      hair={{ id: 'peek', length: .85 }} />
    <Limb id="peek-neck" points={[[-.02, 1.31, -.04], [-.2, 1.08, -.16]]} radii={[.05, .07]} color="#cfc8b6" glow={.1} />
    <Hand id="peek" at={[.2, 1.36, .07]} dir={[.12, 1, .25]} roll={-.6} style={{ finger: .19, spread: .1, curl: .55, thick: .0085 }} color="#cfc8b6" />
  </>,
  // 2. A weathered statue that is a little closer every time: hollow eyes, a cracked screaming face, reaching arms.
  2: <>
    <Shape at={[0,.17,0]} size={[1.14,.32,.75]} color="#4b554e" />
    <Cloth id="statue" color={stone} finish="stone" height={1.25} radius={.42} at={[0, .33, 0]} tear={.04} />
    <Geo geometry={lumpGeometry('chest')} color={stone} finish="stone" at={[0, 1.44, 0]} scale={[.3, .27, .2]} />
    <Head at={[0, 1.86, .04]} rot={[.14, 0, .08]} kind={{ mouth: 'scream', gaunt: 1.4 }} skin="#8e9183" finish="stone" eyes="void" glow={0} scale={1.08} />
    <Rod from={[.06,2.08,.25]} to={[-.03,1.86,.27]} width={.0045} color="#262a25" />
    <Rod from={[-.03,1.86,.27]} to={[.02,1.7,.24]} width={.004} color="#262a25" />
    {[-1, 1].map(side => <group key={side}>
      <Limb id={'statue-arm' + side} points={[[side * .27, 1.56, 0], [side * .38, 1.36, .24], [side * .27, 1.42, .55]]} radii={[.075, .06, .05]} color={stone} finish="stone" />
      <Hand id="statue" at={[side * .27, 1.42, .55]} dir={[side * .1, .2, 1]} roll={side * .4} style={{ finger: .15, spread: .16, curl: .25, thick: .013, nails: false }} color={stone} glow={0} />
      <Shape at={[side * .2, 1.6, .05]} size={[.16, .06, .14]} color="#47573a" sphere finish="flesh" />
    </group>)}
  </>,
  // 3. Hung by the ankles, it drops from the vault: arms dangling, hair hanging to the floor, milky eyes open.
  3: <>
    <Rod from={[0,1.02,0]} to={[0,8.8,0]} width={.028} color={straw} finish="cloth" />
    <group position={[0,1.02,0]} rotation={[0,0,Math.PI]}>
      <mesh position={[0, .02, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.09, .022, 6, 14]} /><Surface color={straw} finish="cloth" /></mesh>
      {[-1, 1].map(side => <Limb key={side} id={'hang-leg' + side} points={[[side * .05, 0, 0], [side * .09, .26, .03], [side * .11, .5, 0]]} radii={[.035, .045, .065]} color="#a39b8b" glow={.06} />)}
      <Cloth id="hang" color="#8f8676" height={.72} radius={.3} at={[0, .48, 0]} tear={.35} flip />
      {[-1, 1].map(side => <group key={side}>
        <Limb id={'hang-arm' + side} points={[[side * .2, 1.06, 0], [side * .27, 1.36, .06], [side * .3, 1.62, .1]]} radii={[.042, .035, .03]} color="#a39b8b" glow={.06} />
        <Hand id="hang" at={[side * .3, 1.62, .1]} dir={[side * .1, 1, .15]} roll={side * .5} style={{ finger: .2, spread: .2, curl: .15, thick: .0085 }} color="#a39b8b" />
      </group>)}
      <Limb id="hang-neck" points={[[0, 1.1, 0], [0, 1.2, .01]]} radii={[.045, .045]} color="#a39b8b" />
      <Head at={[0, 1.34, .02]} kind={{ mouth: 'gape', gaunt: 1.2 }} skin="#a39b8b" eyes="milky" gravity={[0, 1, 0]}
        hair={{ id: 'hang', length: .36 }} />
    </group>
  </>,
  // 4. The door bangs open on a starved, bristling thing with a split jaw and lamp-bright eyes.
  4: <>
    <group name="door-leaf">
      {[0,1,2,3].map(i => <Shape key={i} at={[-.795 + .23*i,1.11,0]}
        size={[.23,2.22,.16]} color={i%2 ? '#5e4536' : '#6a4d3b'} finish="wood" />)}
      {[.36,1.7].map(y => <Shape key={y} at={[-.45,y,.09]} size={[.91,.09,.05]} color={rust} finish="metal" />)}
      {[.36,1.7].flatMap(y => [-.82,-.6,-.3,-.08].map(x => <mesh key={x + ',' + y} position={[x,y,.12]}><sphereGeometry args={[.022,8,6]} /><Surface color="#4b3a30" finish="metal" /></mesh>))}
      {[0,1,2,3].map(i => <Rod key={'s' + i} from={[-.66 + i * .06, 1.35 - i * .04, .085]} to={[-.5 + i * .06, .95 - i * .05, .085]} width={.006} color="#c9b493" finish="wood" />)}
    </group>
    <group name="door-beast">
      <Geo geometry={lumpGeometry('beast', .12, .06)} color="#3b2a25" finish="flesh" at={[0, .82, -.1]} scale={[.5, .38, .62]} glow={.02} />
      <Geo geometry={furGeometry('beast', [.5, .38, .62], 140, .17)} color="#1d1515" finish="hair" at={[0, .82, -.1]} />
      <Limb id="beast-neck" points={[[0, .93, .32], [0, .96, .56]]} radii={[.17, .14]} color="#3b2a25" finish="flesh" />
      <Geo geometry={lumpGeometry('beast-head')} color="#4a3530" finish="flesh" at={[0, .99, .74]} scale={[.17, .15, .27]} glow={.03} />
      <Geo geometry={lumpGeometry('beast-jaw')} color="#3d2b28" finish="flesh" at={[0, .8, .78]} rotation={[.5, 0, 0]} scale={[.13, .055, .23]} />
      <Shape at={[0,.89,.84]} size={[.2,.13,.28]} color="#2a0b0b" sphere finish="flesh" />
      <Geo geometry={teethGeometry('beast-up', 11, .1, .05, [0, -1, .2], .011)} color={bone} finish="stone" at={[0, .92, .92]} />
      <Geo geometry={teethGeometry('beast-low', 9, .085, .04, [0, 1, .15], .01)} color={bone} finish="stone" at={[0, .79, .9]} rotation={[.5, 0, 0]} />
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[side * .1, 1.07, .9]}><sphereGeometry args={[.024, 10, 8]} /><Glow color="#ffb347" /></mesh>
        <Limb id={'beast-fore' + side} points={[[side * .3, .85, .3], [side * .44, .5, .45], [side * .42, .1, .58]]} radii={[.11, .075, .06]} color="#3b2a25" finish="flesh" />
        <Limb id={'beast-hind' + side} points={[[side * .3, .75, -.45], [side * .46, .45, -.62], [side * .4, .08, -.45]]} radii={[.13, .09, .065]} color="#3b2a25" finish="flesh" />
        {[-1, 0, 1].map(k => <Rod key={k} from={[side * .42 + k * .035, .07, .6]} to={[side * .42 + k * .045, .02, .74]} width={.011} color={bone} />)}
      </group>)}
    </group>
  </>,
  // 5. Out of a crack in the wall, a long grey arm reaches for you, every finger too long by a joint.
  5: <>
    <Shape at={[0,1.02,-.08]} size={[.75,.89,.14]} color="#2a2c2c" rotation={[0,0,-.09]} />
    <mesh geometry={crackGeometry()} position={[0, 1.02, -.006]} rotation={[0, 0, -.09]} dispose={null}><Glow color="#020202" /></mesh>
    <group name="reaching-hand">
      <Limb id="reach-arm" points={[[-.05, 1, -.02], [.15, 1.03, .22], [.3, 1.08, .4]]} radii={[.05, .042, .034]} color="#9d978a" glow={.08} />
      {[0, 1].map(k => <Rod key={k} from={[-.02 + k * .02, 1.02 + k * .015, .02]} to={[.25, 1.09 - k * .02, .36]} width={.0045} color="#53505a" />)}
      <Hand id="reach" at={[.3, 1.08, .4]} dir={[.55, .05, .85]} roll={1.35} style={{ finger: .23, spread: .2, curl: .32, thick: .009 }} color="#9d978a" />
    </group>
  </>,
  // 6. Your shadow on the wall is not yours: it grows, cocks its head and lifts arms that end in too many fingers.
  6: <>
    <Shape at={[0,1.0,-.09]} size={[1.46,1.95,.05]} color="#5d5745" />
    <group name="wall-shadow">
      <mesh geometry={shadowPlane()} position={[0, 1, -.062]} dispose={null}>
        <meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {[.045, .085].map(x => <mesh key={x} position={[x, 1.6, -.058]}><sphereGeometry args={[.009, 8, 6]} /><Glow color="#ff5a36" /></mesh>)}
    </group>
  </>,
  // 7. Wet bare footprints with clawed toes run past; a hunched thing in a torn coat scuttles after them.
  7: <>
    {Array.from({length:6}, (_,i) => <group key={i} position={[(i%2 ? .19 : -.19),(i+1)*.003,1.2-i*.49]}>
      <mesh geometry={footprint()} position={[0,.012,0]} rotation={[0,(i%2?1:-1)*.24 + Math.PI,0]} scale={[i % 2 ? -1 : 1, 1, 1]} dispose={null}>
        <meshStandardMaterial map={footprintTexture()} transparent depthWrite={false} roughness={.12} color="#4a4038" polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>)}
    <group name="running-coat">
      <group rotation={[.38, 0, 0]}>
        <Cloth id="runner" color="#262a33" height={1.2} radius={.32} at={[0, .32, 0]} tear={.32} />
        <Geo geometry={lumpGeometry('hunch')} color="#262a33" finish="cloth" at={[0, 1.42, -.06]} scale={[.27, .18, .2]} />
        <Head at={[0, 1.5, .2]} rot={[.75, 0, 0]} scale={.92} kind={{ mouth: 'gape', gaunt: 1.3 }} skin="#b3ab9b" eyes="void" hair={{ id: 'runner', length: .55, veil: true }} />
        <Limb id="runner-arm-l" points={[[-.22, 1.36, .02], [-.3, 1.0, -.16], [-.28, .7, -.38]]} radii={[.036, .03, .026]} color="#b3ab9b" />
        <Hand id="runner" at={[-.28, .7, -.38]} dir={[0, -.6, -.8]} style={longFingers} color="#b3ab9b" />
        <Limb id="runner-arm-r" points={[[.22, 1.36, .02], [.3, 1.08, .25], [.3, .84, .42]]} radii={[.036, .03, .026]} color="#b3ab9b" />
        <Hand id="runner" at={[.3, .84, .42]} dir={[0, -.7, .7]} style={longFingers} color="#b3ab9b" />
      </group>
      <Limb id="runner-leg-l" points={[[-.08, .48, 0], [-.11, .22, .14], [-.09, .02, .06]]} radii={[.035, .03, .024]} color="#8f887a" />
      <Limb id="runner-leg-r" points={[[.08, .48, 0], [.1, .26, -.16], [.12, .06, -.3]]} radii={[.035, .03, .024]} color="#8f887a" />
    </group>
  </>,
  // 8. The lift rises with someone in it: a sack over its head, eyes glinting through the holes, hands on the bars.
  8: <>
    {[-.57,-.28,0,.28,.57].map(x => <Shape key={x} at={[x,1.06,.57]} size={[.046,2.15,.052]} color={rust} finish="metal" />)}
    {[.11,1.02,2.04].map(y => <Shape key={y} at={[0,y,.57]} size={[1.21,.07,.07]} color="#5b4c3e" finish="metal" />)}
    <group name="lift-passenger" position={[0,0,-.12]}>
      <Cloth id="lift" color="#3e332e" height={1.36} radius={.44} tear={.28} />
      <Geo geometry={lumpGeometry('shoulders')} color="#3e332e" finish="cloth" at={[0, 1.36, 0]} scale={[.31, .14, .19]} />
      <mesh geometry={sackHead()} position={[0, 1.64, 0]} scale={[.2, .27, .2]} dispose={null}><meshStandardMaterial map={sackTexture()} color="#8c8270" roughness={.95} /></mesh>
      {/* A crude stitched mouth across the sack. */}
      {[-.06, -.02, .02, .06].map(x => <Rod key={x} from={[x - .012, 1.53, .19]} to={[x + .012, 1.57, .19]} width={.004} color="#1c140e" />)}
      <Rod from={[-.08, 1.55, .188]} to={[.08, 1.55, .188]} width={.003} color="#1c140e" />
      <mesh position={[0, 1.44, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.1, .017, 6, 16]} /><Surface color={straw} finish="cloth" /></mesh>
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[side * .072, 1.68, .17]} scale={[1, .85, .5]}><sphereGeometry args={[.04, 10, 8]} /><Glow color="#030303" /></mesh>
        <mesh position={[side * .068, 1.68, .19]}><sphereGeometry args={[.0055, 6, 4]} /><Glow color="#efe6c6" /></mesh>
        <Limb id={'lift-arm' + side} points={[[side * .26, 1.32, 0], [side * .33, 1.1, .26], [side * .26, 1.28, .5]]} radii={[.04, .034, .029]} color="#a49d8e" />
        <Hand id="grip" at={[side * .26, 1.28, .5]} dir={[0, 1, .2]} roll={side * .2} style={{ finger: .16, spread: .06, curl: 1.15, thick: .0095 }} color="#a49d8e" />
      </group>)}
    </group>
  </>,
  // 9. As the lamps die, something very tall comes on: a void under the hood, two embers for eyes, bone hands.
  9: <>
    <Cloth id="tall-a" color="#0e1116" height={2.25} radius={.72} tear={.38} />
    <Cloth id="tall-b" color="#14171d" height={1.68} radius={.82} at={[0, .58, 0]} tear={.45} />
    <Geo geometry={lumpGeometry('shoulders')} color="#101318" finish="cloth" at={[0, 1.98, 0]} scale={[.44, .2, .28]} />
    <Geo geometry={hoodGeometry()} color="#0c0e12" finish="cloth" at={[0, 2.25, .02]} scale={[.27, .33, .28]} />
    <mesh position={[0, 2.21, .1]} scale={[.19, .23, .1]}><sphereGeometry args={[1, 14, 10]} /><Glow color="#000000" /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .07, 2.25, .2]}><sphereGeometry args={[.017, 10, 8]} /><Glow color="#ffe0b0" /></mesh>
      <Limb id={'tall-sleeve' + side} points={[[side * .42, 1.9, .05], [side * .56, 1.55, .3], [side * .5, 1.38, .55]]} radii={[.13, .11, .1]} color="#0e1116" finish="cloth" />
      <Hand id="bone" at={[side * .5, 1.36, .62]} dir={[side * .15, -.35, 1]} roll={side * .3} style={{ finger: .27, spread: .18, curl: .35, thick: .0075 }} color="#bdb6a6" glow={.12} />
    </group>)}
  </>,
  // 10. Someone waits at the exit in a grey hood, head lolling sideways on a broken neck, arms hanging past the knees.
  10: <>
    <Cloth id="grey" color="#565c58" height={1.5} radius={.46} tear={.2} />
    <Geo geometry={lumpGeometry('shoulders')} color="#5c625e" finish="cloth" at={[0, 1.42, 0]} scale={[.3, .14, .2]} />
    <Geo geometry={hoodGeometry()} color="#5e6460" finish="cloth" at={[-.09, 1.58, -.06]} rotation={[0, 0, 1.0]} scale={[.24, .28, .25]} />
    <Limb id="grey-neck" points={[[0, 1.42, 0], [-.11, 1.5, .03]]} radii={[.05, .045]} color="#bdb7a8" />
    <Head at={[-.17, 1.53, .07]} rot={[0, .1, 1.25]} kind={{ mouth: 'gape', gaunt: 1.3 }} skin="#a9a596" eyes="void" glow={.05} hair={{ id: 'grey', length: .22 }} />
    {[-1, 1].map(side => <group key={side}>
      <Limb id={'grey-arm' + side} points={[[side * .28, 1.38, 0], [side * .34, 1.0, .05], [side * .33, .62, .1]]} radii={[.036, .031, .027]} color="#bdb7a8" />
      <Hand id="hang-low" at={[side * .33, .62, .1]} dir={[0, -1, .1]} roll={side * 1.2} style={{ finger: .23, spread: .1, curl: .2, thick: .0085 }} color="#bdb7a8" />
    </group>)}
  </>,
  // 11. Something rises out of the puddle, wet hair over its face, one hand reaching out of the water for you.
  11: <Basin />,
  // 12. A bed of flesh opens a dozen bloodshot eyes, and every one of them follows you.
  12: <Watchers />,
}
