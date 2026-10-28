import { BoxGeometry } from 'three'

// Shared twelve-triangle block for furniture, steps and planting borders.
const geometry = new BoxGeometry()
export function BeveledBox() {
  return <primitive object={geometry} attach="geometry" dispose={null} />
}
