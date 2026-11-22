// Inset the smaller sphere far enough to hide the faceted pole-to-pole contact.
export const SNOWMAN_JOINT_INSET_RATIO = .45

export function snowmanLayout(base: number, middle: number, head: number) {
  const baseY = base
  const middleY = baseY + base + middle - middle * SNOWMAN_JOINT_INSET_RATIO
  const headY = middleY + middle + head - head * SNOWMAN_JOINT_INSET_RATIO
  return { baseY, middleY, headY, height: headY + head }
}
