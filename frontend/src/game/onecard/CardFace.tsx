import { cardArtwork } from './cardArtwork'
import type { Card } from './protocol'

export function CardFace({ card }: { card: Card }) {
  return <img className="onecard-face-art" src={cardArtwork(card)} alt="" draggable={false} />
}
