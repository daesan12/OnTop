import { SIMPLE_MAP } from './mapRenderProfile'
import { metalGrain } from './ornamentTextures'

/** Shared micro-roughness; reflection comes from the scene's outdoor probe. */
export function OutdoorMetal({
  finish = 'painted',
  vertexColors = false,
}: {
  finish?: 'painted' | 'iron' | 'brass'
  vertexColors?: boolean
}) {
  if(SIMPLE_MAP)return <meshLambertMaterial vertexColors={vertexColors} flatShading/>
  return (
    <meshStandardMaterial
      vertexColors={vertexColors}
      metalness={finish === 'brass' ? 0.78 : finish === 'iron' ? 0.7 : 0.22}
      roughness={finish === 'brass' ? 0.47 : finish === 'iron' ? 0.65 : 0.6}
      roughnessMap={metalGrain}
      bumpMap={metalGrain}
      bumpScale={0.00035}
    />
  )
}
