import * as THREE from 'three'
import { cloneStonePagodaGeometry } from '../../../../world/art/StonePagoda'
import { GARDEN_PAGODA } from '../../../../config/pagoda'
import { RestaurantSet } from './RestaurantSet'

/** 공원의 석탑 원본 형상을 복사해 배치한 주방 배경. 공유 원본은 수정하지 않는다. */
export class TowerRestaurant {
  private readonly geometry = cloneStonePagodaGeometry()
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, side: THREE.DoubleSide })
  constructor(art: RestaurantSet) {
    const root = art.place(art.root, new THREE.Group(), 0, 0, 0)
    root.name = 'cutaway-tower-restaurant'
    const pagoda = new THREE.Mesh(this.geometry, this.material)
    pagoda.name = 'ontop-stone-pagoda'; pagoda.castShadow = pagoda.receiveShadow = true
    pagoda.scale.set(.64 * GARDEN_PAGODA.widthScale, .50, .64 * GARDEN_PAGODA.widthScale)
    // 줌인한 홀 위로 하층 석재가 보이게 두고, 중앙 HUD에 전부 가려지지 않도록 한다.
    art.place(root, pagoda, -5.8, .10, -10.4)
    // 탑 아래 주방은 돌 기단을 개방한 단면으로 표현한다.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 16; col++) {
      art.place(root, art.box(1.52, .58, 2.3, ['#aaa792', '#b5b09b', '#9e9e8c'][(col + row) % 3], .035), -11.6 + col * 1.55, .3 + row * .59, -8.95)
    }
    art.place(root, art.box(25.1, .14, 2.65, '#8d8b7e', .04), 0, 2.94, -8.95)
    for (let col = 0; col < 16; col++) {
      art.place(root, art.box(1.54, .18, 2.65, col % 3 ? '#b5b2a1' : '#bcb8a7', .055), -11.76 + col * 1.568, 3.03, -8.95)
    }
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
        art.place(root, art.box(.38, .28, 1.35, (i + row) % 3 ? '#8d8270' : '#a89a81', .03), side * 12.13, .15 + row * .29, -6.9 + i * 1.4)
      }
      art.place(root, art.box(.55, .14, 14.6, '#b0aa93', .04), side * 12.13, .66, -.45)
    }
  }
  dispose() { this.geometry.dispose(); this.material.dispose() }
}
