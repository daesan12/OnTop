import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

type ContentModule = { default: ComponentType }

/** Keep the host's input/session guards alive while optional UI downloads.
 * Once loaded, retain the component so its normal close/focus effects run. */
export function OnDemandContent({ active, load, label, onClose, className = 'park-deferred-content', children }: {
  active: boolean
  load: () => Promise<ContentModule>
  label: string
  onClose: () => void
  className?: string
  children?: ReactNode
}) {
  const [Content, setContent] = useState<ComponentType | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!active || Content) return
    let current = true
    setError(false)
    void load().then(
      module => { if (current) setContent(() => module.default) },
      () => { if (current) setError(true) },
    )
    return () => { current = false }
  }, [active, Content, load, attempt])

  if (Content) return <Content />
  if (!active) return null
  return <section className={className} aria-label={`${label} 불러오기`}>
    <p role={error ? 'alert' : 'status'}>{error ? `${label} 화면을 불러오지 못했어요.` : `${label} 화면을 준비하고 있어요…`}</p>
    {error && <>
      {children}
      <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button>
    </>}
    <button type="button" onClick={onClose}>닫기</button>
  </section>
}
