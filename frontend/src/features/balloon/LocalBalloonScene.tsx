import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import type { Group } from 'three'
import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { textInputOwnsKeys } from '../../world/inputOwnership'
import { tickLocalBalloon, toggleLocalCabinMode, toggleLocalCabinPerspective, toggleLocalCabinSeat, useLocalBalloon } from './localRide'
import { sampleRemoteBalloon, useRemoteBalloons } from './remoteRide'
import { useBalloonModel } from './useBalloonModel'
import { BalloonCabinSeats } from './BalloonCabinSeats'
import { cabinCamera, dragCabinCamera } from './cabinCamera'
import { cameraRelativeMove } from '../../network/movementInput'
import { useSession } from '../../network/worldClient'

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
  return <group ref={root} name={`remote-balloon-${pilot}`} scale={BALLOON_SCALE}><BalloonCabinSeats /></group>
}

export default function LocalBalloonScene() {
  const root = useRef<Group>(null)
  useBalloonModel(root)
  const held = useRef(new Set<string>())
  const steering = useRef({ dx: 0, dz: 0, run: false, jump: false })
  const canvas = useThree(state => state.gl.domElement)
  const ownId = useSession(state => state.sessionId)
  const remotePilots = useRemoteBalloons(useShallow(state => Object.keys(state.flights).filter(id => id !== ownId)))
  useEffect(() => {
    const input = held.current
    let pointer: { id: number; x: number; y: number } | null = null
    const clear = () => { input.clear(); pointer = null }
    const canLook = () => {
      const ride = useLocalBalloon.getState()
      return ride.walkingInside && ride.flight?.phase === 'flying'
    }
    const pointerDown = (event: PointerEvent) => {
      if (!canLook() || event.button !== 0 || !event.isTrusted) return
      canvas.setPointerCapture(event.pointerId)
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || !canLook()) return
      dragCabinCamera(event.clientX - pointer.x, event.clientY - pointer.y)
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    const pointerEnd = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null }
    const down = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey
        || textInputOwnsKeys(event.target) || useLocalBalloon.getState().flight?.phase !== 'flying') return
      if (event.code === 'KeyF' || event.code === 'KeyE' || event.code === 'KeyV') {
        event.preventDefault()
        if (!event.repeat) {
          if (event.code === 'KeyF') toggleLocalCabinMode()
          else if (event.code === 'KeyE') toggleLocalCabinSeat()
          else toggleLocalCabinPerspective()
        }
        return
      }
      if (!keys.has(event.code)) return
      event.preventDefault()
      input.add(event.code)
    }
    const up = (event: KeyboardEvent) => { input.delete(event.code) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('ontop-clear-input', clear)
    document.addEventListener('visibilitychange', clear)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('lostpointercapture', pointerEnd)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('ontop-clear-input', clear)
      document.removeEventListener('visibilitychange', clear)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('lostpointercapture', pointerEnd)
      clear()
    }
  }, [canvas])

  useFrame((_, delta) => {
    const input = held.current
    const side = Number(input.has('KeyD') || input.has('ArrowRight')) - Number(input.has('KeyA') || input.has('ArrowLeft'))
    const back = Number(input.has('KeyS') || input.has('ArrowDown')) - Number(input.has('KeyW') || input.has('ArrowUp'))
    const inside = useLocalBalloon.getState().walkingInside
    const aim = inside ? cameraRelativeMove(-back, side, cabinCamera.yaw, false, false, steering.current) : null
    tickLocalBalloon({
      x: aim?.dx ?? side,
      z: aim?.dz ?? back,
      lift: Number(input.has('Space')) - Number(input.has('ShiftLeft') || input.has('ShiftRight')),
    }, delta)
    if (!root.current) return
    const { owner, leader, flight } = useLocalBalloon.getState()
    root.current.visible = !!flight && owner === leader
    if (flight) root.current.position.set(flight.position.x, flight.position.y, flight.position.z)
  }, -1.8)

  return <>
    <group ref={root} name="local-balloon-ride" scale={BALLOON_SCALE} visible={false}><BalloonCabinSeats /></group>
    {remotePilots.map(pilot => <RemoteBalloon key={pilot} pilot={pilot} />)}
  </>
}
