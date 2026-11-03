import * as THREE from 'three'
import { RestaurantSet } from './RestaurantSet'

export type CharacterRole = 'guest' | 'server' | 'chef'
export type CharacterLook = ReturnType<typeof characterLook>
const guests = [
  { skin: '#ffcc9f', hair: '#30282b', shirt: '#eab23f', pants: '#343b51', shoes: '#e9ddc5' },
  { skin: '#ffd1ac', hair: '#634337', shirt: '#76bca5', pants: '#494442', shoes: '#eee4d8' },
  { skin: '#eebe96', hair: '#3f3331', shirt: '#394d72', pants: '#403d3c', shoes: '#634335' },
  { skin: '#f7c5a1', hair: '#c8bcb7', shirt: '#a44c80', pants: '#ba87a0', shoes: '#684455' },
  { skin: '#fac8a3', hair: '#c2bab0', shirt: '#ba8a50', pants: '#55503a', shoes: '#664735' },
  { skin: '#ffd0a7', hair: '#82503a', shirt: '#468e8b', pants: '#c5ae83', shoes: '#79523c' },
  { skin: '#bd7950', hair: '#34282a', shirt: '#df745e', pants: '#d9bb85', shoes: '#55a5a0' },
  { skin: '#ffd0ac', hair: '#382b30', shirt: '#b380d5', pants: '#6283a7', shoes: '#d95754' },
] as const

export function characterLook(index: number, role: CharacterRole) {
  const variant = ((index % guests.length) + guests.length) % guests.length
  const palette = role === 'guest' ? guests[variant] : {
    skin: '#ffd0a8', hair: '#945339', shirt: role === 'chef' ? '#4672cf' : '#e67ca5',
    pants: '#443e40', shoes: role === 'chef' ? '#4672cf' : '#e67ca5',
  }
  return { ...palette, variant, role }
}

type Shape = 'ball' | 'body' | 'limb' | 'hair' | 'smile' | 'ring'
type MeshFactory = { mesh(shape: Shape, color: string): THREE.Mesh }

/** Reference-inspired real geometry; attached to the existing animated head/torso joints. */
export function dressCharacter(factory: MeshFactory, art: RestaurantSet, head: THREE.Group, torso: THREE.Group, look: CharacterLook) {
  const { skin, hair, shirt, role, variant } = look
  const cream = '#fff0d6'
  const ball = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const mesh = factory.mesh('ball', color); mesh.scale.set(sx, sy, sz); return art.place(parent, mesh, x, y, z)
  }
  const box = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number) => art.place(parent, art.box(w, h, d, color, .035), x, y, z)
  const tuft = (x: number, y: number, z: number, sx: number, sy: number, angle = 0) => {
    const mesh = ball(head, hair, x, y, z, sx, sy, .12); mesh.rotation.z = angle; return mesh
  }
  ball(head, skin, 0, 0, 0, .46, .41, .39)
  const cap = factory.mesh('hair', hair); cap.scale.set(.478, .43, .414); head.add(cap)
  ball(head, hair, 0, .035, -.21, .43, .30, .23)
  // White sclera and glossy pupils remain legible from the hall camera.
  for (const side of [-1, 1]) {
    ball(head, skin, side * .445, -.025, .005, .085, .105, .085)
    ball(head, '#fffaf0', side * .163, -.025, .355, .108, .14, .047).castShadow = false
    const pupil = ball(head, '#292121', side * .163, -.032, .394, .072, .107, .027)
    pupil.material = art.material('#292121', 0, .26); pupil.castShadow = false
    ball(head, '#ffffff', side * .163 - .021, .012, .417, .024, .029, .009).castShadow = false
    ball(head, '#e89c83', side * .29, -.105, .305, .053, .028, .016).castShadow = false
    const brow = ball(head, hair, side * .163, .151, .36, .077, .025, .025); brow.rotation.z = side * -.10
  }
  ball(head, '#f69d78', 0, -.085, .40, .037, .033, .035)
  const smile = factory.mesh('smile', '#a45b3d'); smile.rotation.z = Math.PI; art.place(head, smile, 0, -.16, .365); smile.castShadow = false

  const curly = role === 'guest' && (variant === 3 || variant === 6)
  if (curly) {
    for (let i = 0; i < 9; i++) {
      const a = i / 8 * Math.PI
      ball(head, hair, Math.cos(a) * .38, .13 + Math.sin(a) * .26, .12, .16, .14, .18)
    }
    for (const x of [-.24, 0, .24]) ball(head, hair, x, .35, -.16, .18)
  } else if (role === 'guest' && variant === 4) {
    for (const side of [-1, 1]) tuft(side * .40, -.005, .06, .07, .17)
  } else if (role === 'guest' && variant === 0) {
    for (let i = 0; i < 5; i++) tuft(-.32 + i * .16, .24 + Math.abs(i - 2) * .018, .31, .12, .17, (i - 2) * -.12)
    tuft(.04, .44, -.05, .085, .15, .4)
  } else {
    tuft(-.23, .20, .31, .13, .23, -.52)
    tuft(-.035, .29, .34, .14, .23, -.65)
    tuft(.20, .28, .30, .13, .21, .70)
    tuft(.36, .12, .16, .09, .19, .2)
  }
  if (role === 'server') {
    ball(head, hair, .24, .21, -.40, .24, .30, .25)
    ball(head, hair, .32, -.08, -.46, .22, .33, .19)
    ball(head, hair, .39, -.29, -.42, .17, .20, .14)
    for (const side of [-1, 1]) tuft(side * .40, -.10, .14, .065, .25, side * .12)
    ball(head, '#ee8fb8', .23, .37, -.29, .11, .075, .11)
  }
  if (role === 'guest' && variant === 1) {
    for (const side of [-1, 1]) ball(head, hair, side * .40, -.055, -.01, .13, .32, .23)
  }
  if (role === 'guest' && variant === 7) {
    for (const side of [-1, 1]) {
      ball(head, hair, side * .43, .30, -.10, .18)
      ball(head, '#bb7bc9', side * .37, .22, .015, .08, .11, .07)
      tuft(side * .41, -.10, .04, .065, .23)
    }
  }
  // Character-specific headwear/accessories, with open glasses rather than opaque lenses.
  if (role === 'guest' && [1, 2, 3].includes(variant)) {
    const color = variant === 1 ? '#238f91' : variant === 2 ? '#4e3e34' : '#b38a3d'
    for (const side of [-1, 1]) {
      if (variant === 2) {
        for (const y of [-.135, .09]) box(head, color, side * .167, y, .423, .255, .025, .025)
        for (const dx of [-.12, .12]) box(head, color, side * .167 + dx, -.023, .423, .025, .225, .025)
      } else {
        const rim = factory.mesh('ring', color); rim.scale.setScalar(variant === 1 ? 1.10 : 1); art.place(head, rim, side * .166, -.025, .425)
      }
      box(head, color, side * .335, -.015, .32, .025, .025, .21)
    }
    box(head, color, 0, .006, .435, .075, .025, .025)
  }
  if (role === 'guest' && variant === 4) {
    ball(head, '#81704e', 0, .32, -.025, .48, .19, .40)
    ball(head, '#68573d', 0, .24, .30, .40, .035, .21)
    for (const side of [-1, 1]) ball(head, hair, side * .063, -.133, .395, .078, .035, .035).rotation.z = side * .2
  }
  if (role === 'guest' && variant === 5) {
    ball(head, '#df753e', 0, .32, -.025, .46, .27, .40)
    ball(head, '#df753e', .09, .56, -.12, .13)
    box(head, '#ed8a50', 0, .23, .36, .75, .12, .095)
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      ball(head, hair, side * (.39 + (i % 2) * .035), -.10 - i * .105, -.04, .085, .09, .09)
    }
  }
  if (role !== 'guest') {
    // Cream hood, apron pocket and diagonal skewer badge match the supplied chef sheet.
    for (const side of [-1, 1]) {
      ball(torso, cream, side * .15, .63, .15, .18, .075, .20).rotation.z = side * .18
      box(torso, cream, side * .18, .44, .275, .065, .29, .035)
      ball(torso, '#e6bf82', side * .18, .36, .312, .039, .039, .012)
      box(torso, cream, side * .34, .46, .09, .09, .055, .16)
    }
    box(torso, cream, 0, .15, .28, .51, .49, .07)
    box(torso, '#f4dfb9', 0, .15, .324, .32, .23, .028)
    const badge = art.place(torso, new THREE.Group(), 0, .14, .35); badge.rotation.z = -.55
    box(badge, '#9d693d', 0, 0, 0, .019, .21, .016)
    for (let i = 0; i < 3; i++) ball(badge, ['#d9744f', '#efb949', '#a96c40'][i], 0, -.055 + i * .055, .014, .034, .033, .014)
    box(torso, cream, 0, .13, -.285, .52, .065, .04)
    for (const side of [-1, 1]) {
      const strap = box(torso, cream, side * .09, .37, -.26, .055, .43, .03); strap.rotation.z = side * -.6
      ball(torso, cream, side * .085, .12, -.325, .085, .04, .025).rotation.z = side * .3
    }
    art.place(head, art.cylinder(.285, .11, cream), -.035, .43, -.045)
    for (const [x, y, z, size] of [[-.21, .54, -.04, .17], [0, .60, -.08, .21], [.17, .54, -.04, .17]]) ball(head, cream, x, y, z, size, size, size * .9)
  } else {
    if ([1, 2, 4, 5, 6].includes(variant)) {
      box(torso, '#f6e5ca', 0, .31, .275, .18, .48, .045)
      for (const side of [-1, 1]) box(torso, shirt, side * .18, .26, .28, .15, .49, .06)
    }
    if (variant === 2) {
      const tie = box(torso, '#b75452', 0, .28, .32, .065, .30, .025); tie.rotation.z = -.05
      ball(torso, '#b75452', 0, .46, .32, .045)
    }
    if ([1, 3, 6].includes(variant)) for (let i = 0; i < 3; i++) ball(torso, '#ead7b3', variant === 1 ? .07 : 0, .45 - i * .14, .325, .027, .027, .012)
    if (variant === 3) {
      art.place(torso, art.cylinder(.33, .22, look.pants, .27), 0, -.025, .01)
      for (const side of [-1, 1]) ball(torso, cream, side * .10, .61, .21, .10, .065, .10)
    }
    if (variant === 4) for (const side of [-1, 1]) box(torso, cream, side * .10, .57, .23, .12, .13, .04).rotation.z = side * .35
    if (variant === 7) {
      box(torso, '#a973c3', 0, .12, .29, .32, .17, .035)
      for (const side of [-1, 1]) box(torso, cream, side * .10, .46, .28, .025, .18, .025)
    }
  }
}
