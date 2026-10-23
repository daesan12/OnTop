/** Keep local test, deployed development, and production table layouts separate. */
export function parkBindingsUrl(
  mode = import.meta.env.MODE,
  development = import.meta.env.DEV,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
) {
  if (development && mode === 'frontend-test')
    return '/park-bindings.frontend-test.json'
  return hostname === 'dev.on-top.world'
    ? '/park-bindings.dev.json'
    : '/park-bindings.json'
}
