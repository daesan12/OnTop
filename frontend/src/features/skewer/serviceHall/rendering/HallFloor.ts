import * as THREE from 'three'
import { ROOM } from '../plan'
import { RestaurantSet } from './RestaurantSet'
import { HALL_STYLE, createHallStoneTexture } from './HallStyle'

// 두 역할은 같은 논리 좌표와 타일을 사용한다. 각 장면의 부모에 깊이 보정을 적용한다.
export const FLOOR_COLUMNS = 11, FLOOR_ROWS = 9
export const FLOOR_DEPTH_SCALE = (ROOM.width / FLOOR_COLUMNS) / (ROOM.depth / FLOOR_ROWS)

export function createHallFloor(art: RestaurantSet) {
  const root = new THREE.Group()
  art.place(root, art.box(ROOM.width, .075, ROOM.depth, HALL_STYLE.grout, .015), 0, -.055, 0)
  const width = ROOM.width / FLOOR_COLUMNS, depth = ROOM.depth / FLOOR_ROWS
  const material = art.material('#ffffff', 0, .88)
  const texture = createHallStoneTexture()
  material.map = texture; material.needsUpdate = true
  const tiles = new THREE.InstancedMesh(art.box(width - .04, .055, depth - .04 / FLOOR_DEPTH_SCALE, '#ffffff', .02).geometry, material, FLOOR_COLUMNS * FLOOR_ROWS)
  const matrix = new THREE.Matrix4(), color = new THREE.Color()
  for (let row = 0; row < FLOOR_ROWS; row++) for (let col = 0; col < FLOOR_COLUMNS; col++) {
    const palette = row < 2 ? HALL_STYLE.kitchenFloor : HALL_STYLE.floor
    matrix.identity().setPosition(-ROOM.width / 2 + (col + .5) * width, -.025, ROOM.back + (row + .5) * depth)
    const index = row * FLOOR_COLUMNS + col
    tiles.setMatrixAt(index, matrix)
    tiles.setColorAt(index, color.set(palette[(row * 3 + col * 7) % palette.length]))
  }
  tiles.name = 'square-tile-floor'; tiles.receiveShadow = true; root.add(tiles)
  return { root, tiles, texture }
}
