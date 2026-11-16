import layouts from 'virtual:park-bindings'

/** Keep local test, deployed development, and production table layouts separate. */
import { GENERATED_PARK_ENABLED, RENEWAL_PARK_ENABLED } from '../mapSelection'
export function parkBindingsUrl(
  mode = import.meta.env.MODE,
  development = import.meta.env.DEV,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
  generated = GENERATED_PARK_ENABLED,
) {
  if (RENEWAL_PARK_ENABLED) return '/generated/park-renewal/park-bindings.json'
  if(generated)return import.meta.env.VITE_PARK_BINDINGS_URL || '/park-bindings.generated.frontend-test.json'
  if (development && mode === 'frontend-test')
    return '/park-bindings.frontend-test.json'
  return hostname === 'dev.on-top.world'
    ? '/park-bindings.dev.json'
    : '/park-bindings.json'
}


/** Layout and emotes belong to the same deployment as the scene. Keep the
 * network-loaded local/test layout, but deployed entry needs no extra request. */
export function packagedParkBindings(
  development = import.meta.env.DEV,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
) {
  if (development || GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED) return undefined
  return hostname === 'dev.on-top.world' ? layouts.development : layouts.production
}

export async function loadParkBindings(signal: AbortSignal) {
  const packaged = packagedParkBindings()
  if (packaged) return packaged
  const response = await fetch(parkBindingsUrl(), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('공원 배치 설정 파일을 읽을 수 없습니다.')
  return response.json() as Promise<unknown>
}
