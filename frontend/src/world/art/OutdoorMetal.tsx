/** Flat painted finishes share the park's texture-free lighting. */
export function OutdoorMetal({
  finish = 'painted',
  vertexColors = false,
}: {
  finish?: 'painted' | 'iron' | 'brass'
  vertexColors?: boolean
}) {
  return (
    <meshStandardMaterial
      vertexColors={vertexColors}
      flatShading
      metalness={finish === 'brass' ? 0.15 : 0}
      roughness={1}
    />
  )
}
