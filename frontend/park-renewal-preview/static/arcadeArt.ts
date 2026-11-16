import { PropBuilder } from '../../src/world/art/propGeometry'
import { addArcadeExterior } from '../approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeExterior'
import { addArcadeInterior, addArcadeWallLining } from '../approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeInterior'

export function createArcadeArt() {
  const body = new PropBuilder(), roof = new PropBuilder(), walls = new PropBuilder()
  const facility = { width: 18, depth: 12, height: 6.4, doorWidth: 4.6 }
  body.box('stone', '#c9bea1', [0, .04, 0], [19.6, .08, 13.6])
  body.box('stone', '#d8cfb8', [0, .1, 0], [18, .08, 12])
  walls.box('paint', '#e0ddc9', [0, 3.2, -6], [18, 6.4, .32])
  for (const side of [-1, 1]) {
    walls.box('paint', '#e0ddc9', [side * 9, 3.2, 0], [.32, 6.4, 12])
    walls.box('paint', '#e0ddc9', [side * 5.65, 3.2, 6], [6.7, 6.4, .32])
    for (const z of [-6, 6]) body.box('wood', '#755135', [side * 9, 3.2, z], [.3, 6.4, .3])
  }
  addArcadeExterior(body, roof, walls, facility)
  addArcadeWallLining(walls, facility)
  addArcadeInterior(body, facility)
  return { body: body.finish(), roof: roof.finish(), walls: walls.finish() }
}
