import { CABIN_DECK_RISE, CABIN_FLOOR_HEIGHT } from './cabin'

export function BalloonCabinDeck() {
  // Match the lower floor's footprint so the insert meets the basket walls.
  return <mesh name="balloon-cabin-deck" position-y={CABIN_FLOOR_HEIGHT - CABIN_DECK_RISE / 2} receiveShadow>
    <cylinderGeometry args={[1.77, 1.77, CABIN_DECK_RISE, 12]} />
    <meshStandardMaterial color="#bd8b51" roughness={.88} />
  </mesh>
}
