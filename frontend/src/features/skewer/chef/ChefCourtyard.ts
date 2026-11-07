import * as THREE from 'three'
import type { RestaurantSet } from '../serviceHall/rendering/RestaurantSet'
import { cloneStonePagodaGeometry } from '../../../world/art/StonePagoda'

/** 석탑 내부 식당의 고정 배경. 공원·수면·행인을 생성하거나 갱신하지 않는다. */
export class ChefCourtyard {
  readonly root = new THREE.Group()
  private geometry = cloneStonePagodaGeometry()
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide })
  constructor(a: RestaurantSet) {
    a.root.add(this.root); this.root.name = 'stone-pagoda-exterior'
    const tower = new THREE.Mesh(this.geometry, this.material)
    tower.scale.setScalar(1.2); tower.position.set(0, -.3, 29); this.root.add(tower)
    a.place(this.root, a.box(48, .4, 36, '#aaa590', .02), 0, -.55, 22)
    for (const side of [-1, 1]) {
      a.place(this.root, a.box(1.2, 7, 26, '#aaa58e', .05), side * 18, 2.8, 18)
      a.place(this.root, a.box(1.6, .3, 26.4, '#858675', .04), side * 18, 6.4, 18)
    }
    this.root.userData.source = 'stone-pagoda'
  }
  dispose() { this.root.removeFromParent(); this.geometry.dispose(); this.material.dispose() }
}
