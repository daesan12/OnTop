import * as THREE from 'three'
import { RestaurantSet } from '../serviceHall/rendering/RestaurantSet'

/** Static park scenery; never owns customer state or interaction targets. */
export class ChefCourtyard {
  private crownGeometry = new THREE.IcosahedronGeometry(1, 2)

  constructor(a: RestaurantSet) {
    const r = a.root
    // Keep lawn behind/beside the terrace. A single oversized ground slab would
    // extend beneath the chef room and surface through it when the hall rises.
    a.place(r, a.box(68, .18, 40, '#647654'), 0, -.28, 22)
    for (const x of [-23, 23]) a.place(r, a.box(22, .18, 58, '#647654'), x, -.28, 12)
    // The dining terrace opens onto a pale stone walk, with lawn on both sides.
    a.place(r, a.box(32, .07, 3.2, '#b7af91'), 0, -.03, 16.2)
    for (const x of [-13.5, 13.5]) {
      a.place(r, a.box(2.8, .07, 24, '#b7af91'), x, -.03, 5.8)
      for (let z = -5; z < 17; z += 2) a.place(r, a.box(2.7, .012, .025, '#928d78'), x, .012, z)
      a.place(r, a.box(.22, .20, 19.7, '#827d69'), Math.sign(x) * 12, .05, 4.4)
    }
    for (let x = -15; x < 16; x += 2) a.place(r, a.box(.025, .012, 3.1, '#928d78'), x, .012, 16.2)
    a.place(r, a.box(24, .20, .22, '#827d69'), 0, .05, 14.3)

    const trees = [[-16, 0], [16, 1], [-17, 8], [17, 9], [-14, 21], [-6, 22], [3, 23], [13, 22], [-24, 19], [24, 20]]
    const crowns = new THREE.InstancedMesh(this.crownGeometry, a.material('#ffffff', 0, .9), trees.length * 5)
    crowns.castShadow = crowns.receiveShadow = true
    const transform = new THREE.Object3D(), colors = ['#617744', '#7f9252', '#879c5b', '#576c40', '#96a765']
    trees.forEach(([x, z], i) => {
      a.place(r, a.cylinder(.27, 4.2, '#75604a', .17), x, 2, z)
      a.contact(r, x, z, 6, 5, .2)
      for (let j = 0; j < 5; j++) {
        const angle = j * 2.4 + i
        transform.position.set(x + Math.cos(angle) * 1.15, 4.4 + (j % 3) * .6, z + Math.sin(angle) * 1.1)
        transform.scale.set(1.8, 1.5 + (j % 2) * .35, 1.7); transform.updateMatrix()
        crowns.setMatrixAt(i * 5 + j, transform.matrix); crowns.setColorAt(i * 5 + j, new THREE.Color(colors[(i + j) % colors.length]))
      }
    })
    r.add(crowns)
    for (const x of [-8, 7]) {
      const bench = a.place(r, new THREE.Group(), x, 0, 18.3)
      for (const z of [-.3, 0, .3]) a.place(bench, a.box(3.2, .13, .22, '#856045'), 0, .75, z)
      for (const y of [1.05, 1.35]) a.place(bench, a.box(3.2, .22, .12, '#856045'), 0, y, .45)
      for (const side of [-1.2, 1.2]) a.place(bench, a.box(.12, 1.5, .13, '#454b42'), side, .75, .42)
      for (const side of [-1.2, 1.2]) a.place(bench, a.box(.12, .72, .13, '#454b42'), side, .36, -.3)
    }
    for (const x of [-12, 12]) {
      a.place(r, a.cylinder(.09, 3.3, '#404a40'), x, 1.6, 14)
      a.lantern(r, x, 3.3, 14, 1.4)
      for (const z of [3.5, 10]) {
        a.place(r, a.box(1.1, .42, 2.7, '#8b8069', .1), x + Math.sign(x) * 3.5, .12, z)
        a.place(r, a.box(1.25, .8, 2.8, '#647c43', .3), x + Math.sign(x) * 3.5, .67, z)
      }
    }
  }

  dispose() { this.crownGeometry.dispose() }
}
