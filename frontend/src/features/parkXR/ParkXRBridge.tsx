import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ParkXRController } from './ParkXRController'
import { parkXRActions, useParkXR } from './state'

export function ParkXRBridge() {
  const { gl, camera, scene } = useThree()
  const controller = useRef<ParkXRController | null>(null)
  useEffect(() => {
    const current = new ParkXRController(gl, camera, scene)
    controller.current = current
    const end = () => current.end()
    parkXRActions.start = current.start; parkXRActions.startJumpmap = current.startJumpmap; parkXRActions.end = end; parkXRActions.guide = current.showGuide
    parkXRActions.settings = current.showSettings
    useParkXR.setState({ ready: true, phase: 'idle', error: '', notice: '' })
    return () => {
      current.dispose()
      if (controller.current === current) controller.current = null
      if (parkXRActions.start === current.start) {
        parkXRActions.start = null; parkXRActions.startJumpmap = null; parkXRActions.end = null; parkXRActions.guide = null
        parkXRActions.settings = null
        useParkXR.setState({ ready: false, phase: 'idle', error: '', notice: '' })
      }
    }
  }, [gl, camera, scene])
  useFrame((_state, _delta, frame) => controller.current?.update(frame), -1)
  return null
}
