import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { EntryStages } from './entryStages'

export function useEntryStages({ stage, finalStage, firstFrameAt, onStage }: {
  stage: number; finalStage: number; firstFrameAt: RefObject<number | null>; onStage: (stage: number) => void
}) {
  const entry = useRef(new EntryStages(finalStage, stage))
  useLayoutEffect(() => {
    entry.current.commit(stage, performance.now())
    if (stage > 0) performance.mark('park-distant-facilities-stage-' + stage)
    if (stage === finalStage) performance.mark('park-distant-facilities-mounted')
  }, [stage, finalStage])

  // Scheduling batches does not own rendering or require a render priority.
  useFrame((_, delta) => {
    const next = entry.current.next(stage, firstFrameAt.current !== null, performance.now(), delta)
    if (next === stage) return
    if (next === 1) performance.mark('park-distant-facilities-start')
    onStage(next)
  })
}
