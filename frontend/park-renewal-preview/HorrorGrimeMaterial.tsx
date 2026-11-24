import {DoubleSide} from 'three'
import {grimeSurface, hazeOnly} from './horrorSurface'

const patches = {metal: grimeSurface('metal'), wood: grimeSurface('wood'), paint: grimeSurface('paint')}
const glowHaze = hazeOnly(.55)

/** Rusted metal, rotten wood or dull paint for the underground, hazed with distance (horrorSurface). */
export function GrimeMaterial({kind, color, vertexColors = false, flatShading = false}:
  {kind: keyof typeof patches; color?: string; vertexColors?: boolean; flatShading?: boolean}) {
  return <meshLambertMaterial color={color ?? '#ffffff'} vertexColors={vertexColors} flatShading={flatShading} side={DoubleSide}
    transparent={false} onBeforeCompile={patches[kind]} customProgramCacheKey={() => 'local-horror-grime-' + kind} />
}

/** Lamp glass and other self-lit parts: they stay bright near you and sink into the haze far away. */
export function HazedGlowMaterial({vertexColors = true, color}: {vertexColors?: boolean; color?: string}) {
  return <meshBasicMaterial vertexColors={vertexColors} color={color ?? '#ffffff'} toneMapped={false}
    onBeforeCompile={glowHaze} customProgramCacheKey={() => 'local-horror-glow'} />
}
