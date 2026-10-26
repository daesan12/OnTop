/** Keep local test, deployed development, and production table layouts separate. */
import { GENERATED_PARK_ENABLED } from '../mapSelection'
export function parkBindingsUrl(
  mode = import.meta.env.MODE,
  development = import.meta.env.DEV,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
  generated = GENERATED_PARK_ENABLED,
) {
  if(generated)return import.meta.env.VITE_PARK_BINDINGS_URL || '/park-bindings.generated.frontend-test.json'
  if (development && mode === 'frontend-test')
    return '/park-bindings.frontend-test.json'
  return hostname === 'dev.on-top.world'
    ? '/park-bindings.dev.json'
    : '/park-bindings.json'
}
