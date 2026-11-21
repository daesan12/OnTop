import { Suspense, useLayoutEffect, type ReactNode, type RefObject } from 'react'

type EntrancePart = 'ground' | 'gacha' | 'mole'

/** Independent facilities may suspend without retrying the procedural entrance.
 * The first-frame gate still waits for all nearby facilities to commit. */
export class EntranceReadiness {
  private parts = { ground: false, gacha: false, mole: false }
  constructor(private target: RefObject<boolean>) {}

  set(part: EntrancePart, ready: boolean) {
    this.parts[part] = ready
    const complete = this.parts.ground && this.parts.gacha && this.parts.mole
    if (complete && !this.target.current) performance.mark('park-gate-ground-mounted')
    this.target.current = complete
  }
}

export function EntrancePartReady({ readiness, part }: { readiness: EntranceReadiness; part: EntrancePart }) {
  useLayoutEffect(() => {
    readiness.set(part, true)
    return () => readiness.set(part, false)
  }, [readiness, part])
  return null
}

export function EntranceFacility({ readiness, part, children }: {
  readiness: EntranceReadiness; part: 'gacha' | 'mole'; children: ReactNode
}) {
  return <Suspense fallback={null}>
    {children}
    <EntrancePartReady readiness={readiness} part={part} />
  </Suspense>
}
