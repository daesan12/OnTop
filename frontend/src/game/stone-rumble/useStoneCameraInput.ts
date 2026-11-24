import { useEffect, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { turnStoneCamera, type StoneCameraState } from './camera'

/** 잠금은 사용자의 경기장 클릭으로만 시작하고, 팝업·퇴장·unmount에서 반드시 해제한다. */
export function useStoneCameraInput(controls: MutableRefObject<StoneCameraState>, enabled: boolean,
  shoot: MutableRefObject<boolean>, onCapture: (captured: boolean) => void) {
  const canvas = useThree(state => state.gl.domElement)
  useEffect(() => {
    let gesture: { id: number; x: number; y: number; moved: boolean; tap: boolean } | null = null
    const clear = () => {
      const id = gesture?.id
      gesture = null
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    }
    const release = () => {
      clear(); shoot.current = false
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
    const captureChanged = () => {
      const captured = document.pointerLockElement === canvas
      if (captured && !enabled) { document.exitPointerLock(); return }
      onCapture(captured)
      if (!captured) { clear(); shoot.current = false; window.dispatchEvent(new Event('ontop-clear-input')) }
    }
    const mouseMove = (event: MouseEvent) => {
      if (enabled && document.pointerLockElement === canvas) turnStoneCamera(controls.current, event.movementX, event.movementY)
    }
    const down = (event: PointerEvent) => {
      if (!enabled) return
      if (event.pointerType === 'mouse' && document.pointerLockElement === canvas) {
        if (event.button === 0) shoot.current = true
        return
      }
      const touch = event.pointerType === 'touch'
      if (touch && !event.isPrimary) { if (gesture) gesture.tap = false; return }
      if (touch || event.button === 2) {
        if (gesture) return
        event.preventDefault()
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, tap: touch }
        canvas.setPointerCapture(event.pointerId)
      } else if (event.button === 0) {
        // 최초 클릭은 카메라만 잡는다. 잠금이 불가능한 브라우저는 우클릭 드래그를 계속 쓸 수 있다.
        event.preventDefault()
        try { Promise.resolve(canvas.requestPointerLock()).catch(() => onCapture(false)) }
        catch { onCapture(false) }
      }
    }
    const move = (event: PointerEvent) => {
      if (!enabled || document.pointerLockElement === canvas || gesture?.id !== event.pointerId) return
      if (event.pointerType === 'mouse' && (event.buttons & 2) === 0) { clear(); return }
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
      if (!gesture.moved && Math.hypot(dx, dy) < 8) return
      gesture.moved = true
      turnStoneCamera(controls.current, dx, dy)
      gesture.x = event.clientX; gesture.y = event.clientY
    }
    const up = (event: PointerEvent) => {
      if (gesture?.id !== event.pointerId) return
      if (enabled && gesture.tap && !gesture.moved) shoot.current = true
      clear()
    }
    const cancel = (event: PointerEvent) => { if (gesture?.id === event.pointerId) clear() }
    const context = (event: Event) => { if (enabled) event.preventDefault() }
    const wheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      controls.current.zoom = Math.max(.8, Math.min(1.3, controls.current.zoom + Math.sign(event.deltaY) * .05))
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    canvas.addEventListener('contextmenu', context)
    canvas.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('pointerlockchange', captureChanged)
    window.addEventListener('blur', release)
    if (!enabled) release()
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      canvas.removeEventListener('contextmenu', context)
      canvas.removeEventListener('wheel', wheel)
      document.removeEventListener('mousemove', mouseMove)
      document.removeEventListener('pointerlockchange', captureChanged)
      window.removeEventListener('blur', release)
      release(); onCapture(false)
    }
  }, [canvas, controls, enabled, shoot, onCapture])
}
