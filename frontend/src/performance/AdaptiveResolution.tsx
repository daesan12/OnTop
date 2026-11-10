import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ResolutionBudget } from './resolutionBudget'

export function AdaptiveResolution({ ceiling }: { ceiling: number }) {
  const budget = useMemo(() => new ResolutionBudget(), [ceiling])
  useFrame((state, delta) => {
    if (document.hidden || state.gl.xr.isPresenting || state.frameloop !== 'always') return
    // R3F's setDpr only runs after sustained slow/fast windows, never each frame.
    if (budget.advance(delta)) state.setDpr(ceiling * budget.scale)
  })
  return null
}
