import { useEffect, useState } from 'react'

/** Canvas lettering must be redrawn after the actual Korean font becomes available. */
export function useCanvasFont(font?: string) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!font) return
    let active = true
    void document.fonts.load(font, '온탑 소리함 메모함 마음 한 장').then(() => {
      if (active) setReady(true)
    }).catch(() => {})
    return () => { active = false }
  }, [font])
  return !font || ready
}
