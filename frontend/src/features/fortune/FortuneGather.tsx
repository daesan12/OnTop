import { useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FORTUNE_GATHER_MS } from './timing'
import cardBack from './art/tapgol-card-back-v4.png'

type CardPose = { x: number; y: number; width: number; height: number; angle: number }

/** Capture before the asynchronous storage lock or result layout can move the cards. */
export function captureFortuneCards(choices: HTMLElement | null): CardPose[] {
  return Array.from(choices?.querySelectorAll<HTMLImageElement>('.fortune-choice img') ?? [], image => {
    const bounds = image.getBoundingClientRect()
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image.parentElement!).transform)
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
      width: image.offsetWidth, height: image.offsetHeight, angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI }
  })
}

/** Decorative copies travel in viewport coordinates; the real result stays hidden until the flip. */
export function FortuneGather({ origins, selectedIndex, target }: {
  origins: CardPose[]; selectedIndex: number; target: RefObject<HTMLDivElement | null>
}) {
  const layer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !target.current || !origins[selectedIndex]) return
    const content = target.current.closest('.fortune-content')
    if (content) content.scrollTop = 0
    if (content && layer.current) {
      const clip = content.getBoundingClientRect()
      layer.current.style.clipPath = `inset(${clip.top}px ${window.innerWidth - clip.right}px ${window.innerHeight - clip.bottom}px ${clip.left}px)`
    }
    const end = target.current.getBoundingClientRect(), chosen = origins[selectedIndex]!
    const animations = Array.from(layer.current?.querySelectorAll('img') ?? [], (image, index) => {
      const origin = origins[index]!, selected = index === selectedIndex
      const transform = (x: number, y: number, width: number, height: number, angle = 0) =>
        `translate(${x - origin.x}px, ${y - origin.y}px) rotate(${angle}deg) scale(${width / origin.width}, ${height / origin.height})`
      const merged = transform(chosen.x, chosen.y - 8, chosen.width, chosen.height)
      return image.animate([
        { offset: 0, transform: transform(origin.x, origin.y, origin.width, origin.height, origin.angle), opacity: 1, easing: 'cubic-bezier(.22,.7,.22,1)' },
        { offset: .55, transform: merged, opacity: 1 },
        { offset: .66, transform: merged, opacity: selected ? 1 : 0, easing: 'cubic-bezier(.4,0,.2,1)' },
        { offset: 1, transform: selected ? transform(end.left + end.width / 2, end.top + end.height / 2, end.width, end.height) : merged, opacity: selected ? 1 : 0 },
      ], { duration: FORTUNE_GATHER_MS, fill: 'both' })
    })
    return () => animations.forEach(animation => animation.cancel())
  }, [origins, selectedIndex, target])
  return createPortal(<div ref={layer} className="fortune-gather" data-selected-card={selectedIndex} aria-hidden="true">
    {origins.map((pose, index) => <img key={index} src={cardBack} alt="" draggable={false} data-selected={index === selectedIndex}
      style={{ left: pose.x - pose.width / 2, top: pose.y - pose.height / 2, width: pose.width, height: pose.height, zIndex: index === selectedIndex ? 2 : 1 }}/>) }
  </div>, document.body)
}
