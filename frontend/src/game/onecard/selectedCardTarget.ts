import { integer } from '../../network/protocol'

/** Only a public card position and the displayed public version cross the wire. */
export function selectedCardTarget(cardIndex: number | undefined, handVersion: number | undefined, scope: { version?: number }) {
  if (cardIndex === undefined) return handVersion === undefined ? {} : null
  const version = handVersion ?? scope.version
  return Number.isInteger(cardIndex) && cardIndex >= 0 && cardIndex < 54 && integer(version) && version === scope.version
    ? { cardIndex, handVersion: version } : null
}
