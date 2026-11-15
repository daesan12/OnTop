import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import type { Group } from 'three'
import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { textInputOwnsKeys } from '../../world/inputOwnership'
import { tickLocalBalloon, useLocalBalloon } from './localRide'
import { sampleRemoteBalloon, useRemoteBalloons } from './remoteRide'
import { useBalloonModel } from './useBalloonModel'

const keys = new Set([
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'ShiftLeft', 'ShiftRight',
])

function RemoteBalloon({ pilot }: { pilot: string }) {
  const root = useRef<Group>(null)
  useBalloonModel(root)
  useFrame(() => {
    const position = sampleRemoteBalloon(pilot)
    if (!root.current || !position) return
    root.current.position.set(position.x, position.y, position.z)
  }, -1.8)
  return <group ref={root} name={`remote-balloon-${pilot}`} scale={BALLOON_SCALE} />
}

export default function LocalBalloonScene() {
  const root = useRef<Group>(null)
  useBalloonModel(root)
  const held = useRef(new Set<string>())
  const remotePilots = useRemoteBalloons(useShallow(state => Object.keys(state.flights)))
  useEffect(() => {
    const input = held.current
    const clear = () => input.clear()
    const down = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || !keys.has(event.code)
        || textInputOwnsKeys(event.target) || useLocalBalloon.getState().flight?.phase !== 'flying') return
      event.preventDefault()
      input.add(event.code)
    }
    const up = (event: KeyboardEvent) => { input.delete(event.code) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('ontop-clear-input', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('ontop-clear-input', clear)
      document.removeEventListener('visibilitychange', clear)
      clear()
    }
  }, [])

  useFrame((_, delta) => {
    const input = held.current
    tickLocalBalloon({
      x: Number(input.has('KeyD') || input.has('ArrowRight')) - Number(input.has('KeyA') || input.has('ArrowLeft')),
      z: Number(input.has('KeyS') || input.has('ArrowDown')) - Number(input.has('KeyW') || input.has('ArrowUp')),
      lift: Number(input.has('Space')) - Number(input.has('ShiftLeft') || input.has('ShiftRight')),
    }, delta)
    if (!root.current) return
    const flight = useLocalBalloon.getState().flight
    root.current.visible = !!flight
    if (flight) root.current.position.set(flight.position.x, flight.position.y, flight.position.z)
  }, -1.8)

  return <>
    <group ref={root} name="local-balloon-ride" scale={BALLOON_SCALE} visible={false} />
    {remotePilots.map(pilot => <RemoteBalloon key={pilot} pilot={pilot} />)}
  </>
}
